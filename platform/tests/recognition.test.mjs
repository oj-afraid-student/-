import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { recognizeStudyProblem } = await import('../src/server/ai/recognition.ts');

test('recognition retries the same image without dropping subquestions and preserves text if diagram review fails', async () => {
  const previousFetch = globalThis.fetch;
  const envKeys = ['ZHIXU_AI_API_KEY', 'ZHIXU_AI_BASE_URL', 'ZHIXU_AI_MODEL'];
  const saved = envKeys.map((key) => process.env[key]);
  Object.assign(process.env, {
    ZHIXU_AI_API_KEY: 'test-only',
    ZHIXU_AI_BASE_URL: 'https://example.test',
    ZHIXU_AI_MODEL: 'test',
  });
  const photo = 'data:image/jpeg;base64,/9j/test';
  const problem = {
    title: '第16题',
    text: '主体原题及全部小问',
    conditions: ['AD=√3/2', 'CD∥AB'],
    questions: ['证明平面垂直', '求二面角余弦值', '第3问', '第4问'],
    diagram: [{ claim: 'AB=2', source: 'label', evidence: '主体配图AB标注2' }],
    uncertainties: [],
  };
  const calls = [];
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (calls.length === 1)
        return Response.json({ choices: [{ finish_reason: 'length', message: { content: '{' } }] });
      if (calls.length === 3) return new Response('', { status: 429 });
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(problem) } }],
      });
    };
    const result = await recognizeStudyProblem('只识别16题', photo);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].max_tokens, 8000);
    assert.deepEqual(calls[0].messages[1], calls[1].messages[1]);
    assert.equal(calls[1].messages[1].content[1].image_url.url, photo);
    assert.match(calls[1].messages[0].content, /不得简化题目、删减小问/);
    assert.doesNotMatch(calls[1].messages[0].content, /只保留1至2个小问/);
    assert.deepEqual(result.questions, problem.questions);
    assert.deepEqual(result.conditions, problem.conditions);
    assert.match(result.uncertainties.at(-1), /图示复核未完成/);

    globalThis.fetch = async () =>
      Response.json({
        choices: [{ finish_reason: 'stop', message: { content: '{"title":"缺失题干"}' } }],
      });
    await assert.rejects(recognizeStudyProblem('题目'), /题目结构不完整/);
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify({ ...problem, diagram: [] }) },
          },
        ],
      });
    assert.deepEqual((await recognizeStudyProblem('文字题')).questions, problem.questions);
  } finally {
    globalThis.fetch = previousFetch;
    envKeys.forEach((key, i) =>
      saved[i] === undefined ? delete process.env[key] : (process.env[key] = saved[i]),
    );
  }
});
