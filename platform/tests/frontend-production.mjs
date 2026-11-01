// Run against pnpm start, including a run with ZHIXU_DEV_FIXTURES=1 to verify fail-closed behavior.
import test from 'node:test';
import assert from 'node:assert/strict';

const origin = process.env.ZHIXU_PRODUCTION_TEST_URL ?? 'http://127.0.0.1:3001';
test('生产服务禁用开发适配，不暴露旧原型文件或预设账号', async () => {
  const login = await fetch(`${origin}/login`);
  assert.equal(login.status, 200);
  const html = await login.text();
  assert.ok(!html.includes('开发样例环境'));
  assert.ok(!html.includes('fixture-only-password'));
  const development = await fetch(`${origin}/api/development/auth/me`);
  assert.equal(development.status, 404);
  assert.equal((await development.json()).error.code, 'NOT_FOUND');
  const register = await fetch(`${origin}/api/development/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'should_not_exist', password: 'not-created-password' }),
  });
  assert.equal(register.status, 404);
  const health = await fetch(`${origin}/api/v1/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).data.status, 'ok');
  for (const path of ['/src/core.js', '/data/demo-data.json', '/index.html'])
    assert.equal((await fetch(`${origin}${path}`)).status, 404, path);
});
