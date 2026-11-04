import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Exercise the real server-only password module without a database or Next server.
test('真实密码模块独立盐、正确密码、首尾空格与损坏哈希', () => {
  const moduleUrl = new URL('../src/server/auth/password.ts', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { hashPassword, verifyPassword } from ${JSON.stringify(moduleUrl)};
    const password = ' spaced test password ';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    assert.notEqual(first, second);
    assert.equal(first.split('$').length, 6);
    assert.equal(await verifyPassword(password, first), true);
    assert.equal(await verifyPassword(password.trim(), first), false);
    assert.equal(await verifyPassword(password, undefined), false);
    assert.equal(await verifyPassword(password, 'malformed'), false);
    assert.equal(await verifyPassword(password, first.replace('32768', '2147483648')), false);
  `;
  const result = spawnSync(process.execPath, ['--conditions=react-server', '--input-type=module'], {
    input: script,
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
