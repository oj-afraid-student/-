// Opt-in real PostgreSQL + production HTTP test. Uses and removes its own isolated schema.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';
const connection = process.env.ZHIXU_PRACTICE_TEST_DATABASE_URL;
if (!connection)
  throw new Error('Set ZHIXU_PRACTICE_TEST_DATABASE_URL to a local PostgreSQL test database.');
const url = new URL(connection);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use a local test database.');
const schema = `practice_test_${randomBytes(6).toString('hex')}`;
const admin = new pg.Pool({ connectionString: connection });
const testUrl = new URL(connection);
testUrl.searchParams.set('options', `-csearch_path=${schema},public`);
const pool = new pg.Pool({ connectionString: testUrl.href });
const port = Number(process.env.ZHIXU_PRACTICE_TEST_PORT ?? 4317);
const origin = `http://127.0.0.1:${port}`;
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const bank = JSON.parse(await read('fixtures/server/question-bank.json'));
const examples = JSON.parse(await read('fixtures/api/practice/result-response.json')).data;
let app,
  appLog = '';
async function start() {
  app = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, DATABASE_URL: testUrl.href, ZHIXU_DEV_FIXTURES: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  app.stdout.on('data', (chunk) => {
    appLog += chunk;
  });
  app.stderr.on('data', (chunk) => {
    appLog += chunk;
  });
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error(`App exited: ${appLog}`);
    try {
      if ((await fetch(`${origin}/api/v1/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`App did not start: ${appLog}`);
}
async function stop() {
  if (!app || app.exitCode !== null) return;
  const exited = once(app, 'exit');
  app.kill('SIGTERM');
  await exited;
}
function agent() {
  let cookie = '';
  return {
    async call(path, method = 'GET', value, status = 200, headers = {}) {
      const response = await fetch(`${origin}/api/v1${path}`, {
        method,
        headers: {
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(value === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
      if (response.headers.has('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      const body = await response.json();
      assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(body)}`);
      assert.match(response.headers.get('cache-control'), /no-store/);
      if (status >= 400) {
        assert.equal(body.data, null);
        return body.error;
      }
      assert.equal(body.error, null);
      return body.data;
    },
    async rawSubmit(id, value) {
      const response = await fetch(`${origin}/api/v1/practices/${id}/submit`, {
        method: 'POST',
        headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}
const payload = (practice) => ({
  answers: practice.items.map((item) => ({
    practiceItemId: item.id,
    answer: structuredClone(
      examples.items.find((sample) => sample.question.id === item.question.id).answer,
    ),
  })),
});
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await read('db/migrations/001_initial.sql'));
  await pool.query(await read('db/migrations/002_practice_v2.sql'));
  for (const record of bank)
    await pool.query(
      `INSERT INTO question_version
    (question_key, version, public_question, reference_answer, grading, source)
    VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        record.question.id,
        record.question.version,
        record.question,
        record.reference,
        record.grading,
        record.source,
      ],
    );
  await start();
  const a = agent(),
    b = agent(),
    anonymous = agent();
  for (const [client, username] of [
    [a, 'test_one'],
    [b, 'test_two'],
  ]) {
    await client.call('/auth/register', 'POST', { username, password: 'password123' }, 201);
    await client.call('/auth/me', 'GET', undefined, 401);
    await client.call('/auth/login', 'POST', { username, password: 'password123' });
  }
  await anonymous.call('/practices', 'POST', { mode: 'ALL' }, 401);
  await a.call('/practices', 'POST', { mode: 'ALL' }, 404);
  await anonymous.call('/knowledge-points', 'GET', undefined, 401);
  assert.deepEqual(await a.call('/knowledge-points'), []);
  const importRelease = () => {
    const imported = spawnSync(process.execPath, ['scripts/db.mjs', 'import-content'], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, DATABASE_URL: testUrl.href },
      encoding: 'utf8',
    });
    assert.equal(imported.status, 0, imported.error?.message ?? imported.stderr);
  };
  importRelease();
  importRelease();
  const units = JSON.parse(await read('fixtures/content/knowledge-units.json'));
  assert.deepEqual(
    await a.call('/knowledge-points'),
    units.map(({ sections, figures, ...summary }) => summary),
  );
  for (const unit of units) {
    assert.deepEqual(await a.call('/knowledge-points/' + unit.id), unit);
    const practice = await a.call(
      '/practices',
      'POST',
      {
        mode: 'FILTERED',
        knowledgePointId: unit.id,
      },
      201,
    );
    assert.deepEqual(
      practice.items.map(({ question }) => question.id),
      unit.questionIds,
    );
  }
  await a.call('/knowledge-points/unknown', 'GET', undefined, 404);
  const figure = await fetch(origin + units[0].figures[0].src);
  assert.equal(figure.status, 200);
  assert.match(figure.headers.get('content-type'), /^image\//);
  console.log('PASS 正式导入重跑、六单元15知识点、图形和单元选题一致');
  await a.call('/practices', 'POST', { mode: 'ALL', userId: 'forged' }, 400);
  await a.call('/practices', 'POST', { mode: 'ALL' }, 400, { Origin: 'http://foreign.invalid' });
  const p = await a.call('/practices', 'POST', { mode: 'ALL' }, 201);
  assert.equal(p.totalCount, 24);
  assert.equal(/correctOptionIds|acceptedValues|reference|grading/.test(JSON.stringify(p)), false);
  await b.call(`/practices/${p.id}`, 'GET', undefined, 404);
  await b.call(`/practices/${p.id}/submit`, 'POST', payload(p), 404);
  await a.call('/practices/not-a-uuid', 'GET', undefined, 404);
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () => a.rawSubmit(p.id, payload(p))),
  );
  assert.deepEqual(
    concurrent.map((r) => r.status).sort(),
    [200, 200, 200, 200, 200, 200, 200, 201],
  );
  assert.equal(new Set(concurrent.map((r) => r.body.data.submissionId)).size, 1);
  const sid = concurrent[0].body.data.submissionId;
  const result = await a.call(`/me/submissions/${sid}`);
  assert.equal(result.score, null);
  assert.equal(result.correctCount, 11);
  assert.equal(result.pendingCount, 13);
  assert.deepEqual(
    result.items.map((i) => i.answer),
    examples.items.map((i) => i.answer),
  );
  await b.call(`/me/submissions/${sid}`, 'GET', undefined, 404);
  assert.equal((await b.call('/me/submissions')).total, 0);
  const changed = payload(p);
  changed.answers[0].answer.selectedOptionId = 'A';
  if (changed.answers[0].answer.selectedOptionId === payload(p).answers[0].answer.selectedOptionId)
    changed.answers[0].answer.selectedOptionId = 'B';
  await a.call(`/practices/${p.id}/submit`, 'POST', changed, 409);
  assert.equal((await a.call(`/practices/${p.id}`)).submissionId, sid);
  console.log('PASS 真实认证、24题、三态结果、跨账号404、8并发同答案只保存一次');

  const choices = await a.call(
    '/practices',
    'POST',
    { mode: 'FILTERED', questionTypes: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'], count: 5 },
    201,
  );
  const good = payload(choices);
  for (const entry of good.answers.slice(3)) {
    const q = choices.items.find((i) => i.id === entry.practiceItemId).question;
    const grading = bank.find((r) => r.question.id === q.id).grading;
    const wrong = q.options.find((o) => !grading.correctOptionIds.includes(o.id)).id;
    entry.answer =
      q.type === 'SINGLE_CHOICE'
        ? { type: q.type, selectedOptionId: wrong }
        : { type: q.type, selectedOptionIds: [wrong] };
  }
  const submitted = await a.call(`/practices/${choices.id}/submit`, 'POST', good, 201);
  const scored = await a.call(`/me/submissions/${submitted.submissionId}`);
  assert.equal(scored.score, 3);
  assert.equal(scored.maxScore, 5);
  const wrongIds = scored.items
    .filter((i) => i.evaluation.status === 'INCORRECT')
    .map((i) => i.question.id);
  const redo = await a.call('/practices', 'POST', { mode: 'EXPLICIT', questionIds: wrongIds }, 201);
  assert.equal(redo.totalCount, 2);
  assert.notEqual(redo.id, choices.id);

  const race = await a.call('/practices', 'POST', { mode: 'EXPLICIT', questionIds: ['Q01'] }, 201);
  const one = payload(race),
    two = payload(race);
  two.answers[0].answer.selectedOptionId =
    one.answers[0].answer.selectedOptionId === 'A' ? 'B' : 'A';
  const conflicts = await Promise.all([a.rawSubmit(race.id, one), a.rawSubmit(race.id, two)]);
  assert.deepEqual(conflicts.map((r) => r.status).sort(), [201, 409]);
  const winning = conflicts.find((r) => r.status === 201).body.data;
  assert.deepEqual(
    (await a.call(`/me/submissions/${winning.submissionId}`)).items[0].answer,
    conflicts[0].status === 201 ? one.answers[0].answer : two.answers[0].answer,
  );
  console.log('PASS 五题3/5、错题重练、真实不同答案并发201/409');

  const rollback = await a.call('/practices', 'POST', { mode: 'ALL' }, 201);
  const before = (await pool.query('SELECT count(*) FROM submission')).rows[0].count;
  await pool.query(`CREATE FUNCTION fail_answer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF (SELECT count(*) FROM submission_answer WHERE practice_id = NEW.practice_id) >= 2
      THEN RAISE EXCEPTION 'injected save failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_answer BEFORE INSERT ON submission_answer FOR EACH ROW EXECUTE FUNCTION fail_answer();`);
  await a.call(`/practices/${rollback.id}/submit`, 'POST', payload(rollback), 500);
  assert.equal((await pool.query('SELECT count(*) FROM submission')).rows[0].count, before);
  assert.equal(
    (await pool.query('SELECT count(*) FROM submission_answer WHERE practice_id=$1', [rollback.id]))
      .rows[0].count,
    '0',
  );
  assert.equal((await a.call(`/practices/${rollback.id}`)).status, 'OPEN');
  await pool.query('DROP TRIGGER fail_answer ON submission_answer');
  await a.call(`/practices/${rollback.id}/submit`, 'POST', payload(rollback), 201);

  const newer = structuredClone(bank[0]);
  newer.question.version = 2;
  newer.reference.explanation = '新版解析';
  await pool.query(
    `INSERT INTO question_version (question_key,version,public_question,reference_answer,grading,is_published)
    VALUES ('Q01',2,$1,$2,$3,true)`,
    [newer.question, newer.reference, newer.grading],
  );
  await pool.query(
    "UPDATE question_version SET is_published=false WHERE question_key='Q01' AND version=1",
  );
  assert.equal(
    (await a.call('/practices', 'POST', { mode: 'EXPLICIT', questionIds: ['Q01'] }, 201)).items[0]
      .question.version,
    2,
  );
  assert.equal((await a.call(`/me/submissions/${sid}`)).items[0].question.version, 1);
  await pool.query("UPDATE question_version SET is_published=false WHERE question_key='Q01'");
  assert.ok(!(await a.call('/knowledge-points/SG-01')).questionIds.includes('Q01'));
  await a.call('/practices', 'POST', { mode: 'EXPLICIT', questionIds: ['Q01'] }, 404);
  assert.deepEqual(await a.call(`/me/submissions/${sid}`), result);
  await a.call(`/practices/${p.id}/submit`, 'POST', payload(p));
  console.log('PASS 中途失败全量回滚、恢复重试、版本固定、下架不破坏历史');

  await pool.query("UPDATE submission SET submitted_at='2026-11-08T00:00:00Z'");
  const all = await a.call('/me/submissions');
  assert.deepEqual(
    all.items.map((i) => i.id),
    [...all.items.map((i) => i.id)].sort().reverse(),
  );
  const page = await a.call('/me/submissions?page=2&pageSize=1');
  assert.equal(page.items[0].id, all.items[1].id);
  assert.deepEqual((await a.call('/me/submissions?page=999')).items, []);
  await a.call('/me/submissions?page=1&page=2', 'GET', undefined, 400);
  await a.call('/auth/logout', 'POST');
  await a.call(`/me/submissions/${sid}`, 'GET', undefined, 401);
  await a.call('/auth/login', 'POST', { username: 'test_one', password: 'password123' });
  const persisted = await a.call(`/me/submissions/${sid}`);
  await stop();
  await start();
  assert.deepEqual(await a.call(`/me/submissions/${sid}`), persisted);
  assert.equal((await a.call('/me/submissions')).total, all.total);
  console.log('PASS 同时戳稳定分页、退出重登、应用重启后会话及答卷保留');
} finally {
  await stop();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
