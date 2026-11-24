import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { modelJson } = await import('../src/server/ai/model.ts');
test('model errors distinguish authentication, rate limit, truncation and invalid JSON without exposing upstream body', async () => {
  const previous = globalThis.fetch;
  const saved = Object.fromEntries(
    ['ZHIXU_AI_API_KEY', 'ZHIXU_AI_BASE_URL', 'ZHIXU_AI_MODEL'].map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, {
    ZHIXU_AI_API_KEY: 'test-only',
    ZHIXU_AI_BASE_URL: 'https://api.deepseek.com',
    ZHIXU_AI_MODEL: 'test',
  });
  try {
    for (const [status, pattern] of [
      [401, /认证失败/],
      [402, /余额不足/],
      [429, /过于频繁/],
    ]) {
      globalThis.fetch = async () => new Response('private upstream detail', { status });
      await assert.rejects(
        modelJson('json', 'test'),
        (e) => pattern.test(e.message) && !e.message.includes('private'),
      );
    }
    for (const [finish, content, pattern] of [
      ['length', '{', /输出长度/],
      ['stop', 'invalid', /无效JSON/],
    ]) {
      globalThis.fetch = async () =>
        Response.json({ choices: [{ finish_reason: finish, message: { content } }] });
      await assert.rejects(modelJson('json', 'test'), pattern);
    }
    globalThis.fetch = async (_url, opts) => {
      const b = JSON.parse(opts.body);
      assert.equal(b.thinking.type, 'disabled');
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
      });
    };
    assert.deepEqual(await modelJson('json', 'test'), { ok: true });
    let attempts = 0;
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: ++attempts === 1 ? 'invalid' : '```json\n{"ok":true}\n```' },
          },
        ],
      });
    assert.deepEqual(await modelJson('json', 'test'), { ok: true });
    assert.equal(attempts, 2);
    const limits = [];
    globalThis.fetch = async (_url, opts) => {
      const body = JSON.parse(opts.body);
      limits.push(body.max_tokens);
      if (limits.length === 1)
        return Response.json({
          choices: [{ finish_reason: 'length', message: { content: '{"partial":' } }],
        });
      assert.match(body.messages[0].content, /重新生成/);
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
      });
    };
    assert.deepEqual(await modelJson('json', 'test', 5000, { recoverLength: true }), { ok: true });
    assert.deepEqual(limits, [5000, 8000]);
    let failedAttempts = 0;
    globalThis.fetch = async () => {
      failedAttempts++;
      return Response.json({ choices: [{ finish_reason: 'length', message: { content: '{' } }] });
    };
    await assert.rejects(modelJson('json', 'test', 5000, { recoverLength: true }), /输出长度/);
    assert.equal(failedAttempts, 2);
    process.env.ZHIXU_AI_BASE_URL = 'https://llmapi.paratera.com';
    process.env.ZHIXU_AI_MODEL = 'DeepSeek-V4.1-Flash-1017';
    const thinkingModes = [];
    globalThis.fetch = async (_url, opts) => {
      thinkingModes.push(JSON.parse(opts.body).thinking);
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
      });
    };
    await modelJson('json', 'test', 8000, { disableThinking: true });
    await modelJson('json', 'test');
    assert.deepEqual(thinkingModes, [{ type: 'disabled' }, undefined]);
  } finally {
    globalThis.fetch = previous;
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
