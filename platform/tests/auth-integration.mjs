// Explicitly run against a local application and a real local PostgreSQL database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

const origin = process.env.ZHIXU_AUTH_TEST_URL;
if (!origin || !process.env.DATABASE_URL)
  throw new Error('Set ZHIXU_AUTH_TEST_URL and DATABASE_URL for this explicit test.');
const local = (hostname) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
assert.ok(local(new URL(origin).hostname), 'Only run against a local application.');
assert.ok(
  local(new URL(process.env.DATABASE_URL).hostname),
  'Only run against a local test/development database.',
);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const names = new Set();
const prefix = `qa_${randomBytes(5).toString('hex')}`;
const credentials = (suffix) => {
  const value = { username: `${prefix}_${suffix}`, password: ' space password ' };
  names.add(value.username);
  return value;
};

function agent(initial = '') {
  let cookie = initial;
  return {
    get cookie() {
      return cookie;
    },
    async call(path, method = 'GET', value, extra = {}) {
      const response = await fetch(`${origin}/api/v1/auth${path}`, {
        method,
        headers: {
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(value === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...extra,
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const body = await response.json();
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.deepEqual(Object.keys(body).sort(), ['data', 'error']);
      return { status: response.status, body, setCookie };
    },
  };
}

test('真实 PostgreSQL 认证：校验、密码哈希、会话、退出、过期与账号隔离', async (t) => {
  t.after(async () => {
    try {
      await pool.query(
        'DELETE FROM app_session WHERE user_id IN (SELECT id FROM app_user WHERE username = ANY($1::text[]))',
        [[...names]],
      );
      await pool.query('DELETE FROM app_user WHERE username = ANY($1::text[])', [[...names]]);
    } finally {
      await pool.end();
    }
  });
  const a = agent(),
    b = agent(),
    c = credentials('a'),
    other = credentials('b');
  let user;
  await t.test('注册、校验和注册不自动登录', async () => {
    assert.equal((await a.call('/me')).status, 401);
    const first = await a.call('/register', 'POST', {
      ...c,
      username: ` ${c.username.toUpperCase()} `,
    });
    assert.equal(first.status, 201);
    user = first.body.data;
    assert.deepEqual(Object.keys(user).sort(), ['id', 'username']);
    assert.equal(user.username, c.username);
    assert.equal(first.setCookie, null);
    assert.equal((await a.call('/me')).status, 401);
    assert.equal((await a.call('/register', 'POST', c)).status, 409);
    for (const value of [
      null,
      [],
      {},
      { ...c, userId: user.id },
      { ...c, password: 'short' },
      { ...c, username: 'bad name' },
    ]) {
      assert.equal((await a.call('/register', 'POST', value)).status, 400);
    }
    assert.equal(
      (await a.call('/register', 'POST', c, { Origin: 'https://unrelated.invalid' })).status,
      400,
    );
    assert.equal(
      (await a.call('/register', 'POST', c, { 'Sec-Fetch-Site': 'cross-site' })).status,
      400,
    );
    assert.equal((await a.call('/me?userId=other')).status, 400);
    const malformed = await fetch(`${origin}/api/v1/auth/register`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(malformed.status, 400);
    const oversized = await fetch(`${origin}/api/v1/auth/register`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: c.username, password: 'x'.repeat(1024 * 1024) }),
    });
    assert.equal(oversized.status, 400);
  });
  await t.test('密码带独立盐保存，错密和不存在账号统一401', async () => {
    assert.equal((await b.call('/register', 'POST', other)).status, 201);
    const { rows } = await pool.query(
      'SELECT password_hash FROM app_user WHERE username = ANY($1::text[])',
      [[c.username, other.username]],
    );
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.notEqual(row.password_hash, c.password);
      assert.match(row.password_hash, /^scrypt\$32768\$8\$3\$/);
    }
    assert.notEqual(rows[0].password_hash, rows[1].password_hash);
    const wrong = await a.call('/login', 'POST', { ...c, password: c.password.trim() });
    const unknown = await a.call('/login', 'POST', { ...c, username: `${prefix}_none` });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.body.error, unknown.body.error);
    assert.equal((await a.call('/me')).status, 401);
  });
  await t.test('随机会话、Cookie和哈希存储，重新登录轮换会话', async () => {
    const login = await a.call('/login', 'POST', c);
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.data, user);
    assert.match(login.setCookie, /HttpOnly/i);
    assert.match(login.setCookie, /SameSite=Lax/i);
    assert.match(login.setCookie, /Path=\//i);
    assert.match(login.setCookie, /Max-Age=28800/i);
    const token = a.cookie.split('=')[1];
    const oldCookie = a.cookie;
    const { rows } = await pool.query(
      'SELECT token_hash, expires_at FROM app_session WHERE user_id=$1',
      [user.id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].token_hash, createHash('sha256').update(token).digest('hex'));
    assert.notEqual(rows[0].token_hash, token);
    assert.ok(new Date(rows[0].expires_at).getTime() > Date.now());
    assert.deepEqual((await a.call('/me')).body.data, user);
    assert.equal((await a.call('/login', 'POST', c)).status, 200);
    assert.notEqual(a.cookie, oldCookie);
    assert.equal((await agent(oldCookie).call('/me')).status, 401);
    assert.equal((await agent('zhixu_session=forged').call('/me')).status, 401);
    assert.equal((await agent(`zhixu_development_session=${token}`).call('/me')).status, 401);
    assert.equal((await b.call('/login', 'POST', other)).status, 200);
    assert.equal((await b.call('/me')).body.data.username, other.username);
    assert.equal((await a.call('/me')).body.data.username, c.username);
  });
  await t.test('退出确实撤销会话，重复退出成功且不影响另一账号', async () => {
    const saved = a.cookie;
    assert.equal((await a.call('/logout', 'POST', {})).status, 400);
    const logout = await a.call('/logout', 'POST');
    assert.equal(logout.status, 200);
    assert.deepEqual(logout.body.data, { success: true });
    assert.match(logout.setCookie, /Max-Age=0/i);
    assert.equal((await agent(saved).call('/me')).status, 401);
    assert.equal((await a.call('/me')).status, 401);
    assert.equal((await a.call('/logout', 'POST')).status, 200);
    assert.equal((await b.call('/me')).status, 200);
  });
  await t.test('过期会话拒绝访问', async () => {
    await a.call('/login', 'POST', c);
    await pool.query(
      "UPDATE app_session SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE user_id=$1",
      [user.id],
    );
    assert.equal((await a.call('/me')).status, 401);
    assert.equal((await a.call('/logout', 'POST')).status, 200);
  });
  await t.test('并发重复注册仅创建一个账号', async () => {
    const same = credentials('race');
    const results = await Promise.all(
      Array.from({ length: 4 }, () => agent().call('/register', 'POST', same)),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409]);
    const { rows } = await pool.query(
      'SELECT count(*)::integer AS n FROM app_user WHERE username=$1',
      [same.username],
    );
    assert.equal(rows[0].n, 1);
  });
});
