import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { generateSolution } = await import('../src/server/ai/solution.ts');
async function mocked(run) {
  const fetch = globalThis.fetch;
  const keys = ['ZHIXU_AI_API_KEY', 'ZHIXU_AI_BASE_URL', 'ZHIXU_AI_MODEL'];
  const values = keys.map((key) => process.env[key]);
  Object.assign(process.env, {
    ZHIXU_AI_API_KEY: 'test-only',
    ZHIXU_AI_BASE_URL: 'https://example.test',
    ZHIXU_AI_MODEL: 'test',
  });
  try {
    await run();
  } finally {
    globalThis.fetch = fetch;
    keys.forEach((key, i) =>
      values[i] === undefined ? delete process.env[key] : (process.env[key] = values[i]),
    );
  }
}
const response = (result) =>
  Response.json({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }],
  });
const choice = {
  stem: '选择正确说法',
  fields: ['选项甲', '选项乙', '选项丙', '选项丁'],
  type: 'MULTIPLE_CHOICE',
};
const solved = {
  status: 'SOLVED',
  answers: ['A', 'C'],
  explanation: 'A和C成立，B和D不成立。',
  questions: [],
};
test('solution enforces choice letters, valid range and written answer count; uncertain problems stay unanswered', () =>
  mocked(async () => {
    globalThis.fetch = async () => response(solved);
    assert.deepEqual(await generateSolution(choice), solved);
    const withoutEmptyQuestions = { ...solved };
    delete withoutEmptyQuestions.questions;
    globalThis.fetch = async () => response(withoutEmptyQuestions);
    assert.deepEqual(await generateSolution(choice), solved);
    for (const answers of [
      ['1', '3'],
      ['A', 'E'],
      ['A', 'A'],
    ]) {
      globalThis.fetch = async () => response({ ...solved, answers });
      await assert.rejects(generateSolution(choice), /字母|范围不匹配/);
    }
    const written = {
      stem: '大题题干',
      fields: ['证明第一问', '计算第二问'],
      type: 'COMPREHENSIVE',
    };
    globalThis.fetch = async () => response({ ...solved, answers: ['第一问证明完成'] });
    await assert.rejects(generateSolution(written), /数量或选项范围/);
    globalThis.fetch = async () => response({ ...solved, answers: ['第一问结论', '第二问结果'] });
    assert.equal((await generateSolution(written)).answers.length, 2);
    const unclear = {
      status: 'NEEDS_CLARIFICATION',
      answers: [],
      explanation: '缺少指定长度，无法唯一确定。',
      questions: ['请核对AB的长度。'],
    };
    globalThis.fetch = async () => response(unclear);
    assert.deepEqual(await generateSolution(written), unclear);
  }));
test('solution retry retains edited stem, all fields and original photo; rejects bad input before calling model', () =>
  mocked(async () => {
    const input = { ...choice, photo: 'data:image/jpeg;base64,/9j/AA==' };
    const calls = [];
    globalThis.fetch = async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return calls.length === 1
        ? Response.json({ choices: [{ finish_reason: 'length', message: { content: '{' } }] })
        : response(solved);
    };
    assert.deepEqual(await generateSolution(input), solved);
    assert.equal(calls[0].max_tokens, 8000);
    assert.deepEqual(calls[0].messages[1], calls[1].messages[1]);
    assert.match(calls[1].messages[0].content, /不改题、不漏问/);
    assert.deepEqual(JSON.parse(calls[1].messages[1].content[0].text), choice);
    assert.equal(calls[1].messages[1].content[1].image_url.url, input.photo);
    await assert.rejects(generateSolution({ ...input, fields: [] }), /填写完整题干/);
    await assert.rejects(
      generateSolution({ ...input, photo: 'https://bad.test/image' }),
      /填写完整题干/,
    );
    assert.equal(calls.length, 2);
    globalThis.fetch = async () => response({ ...solved, explanation: '' });
    await assert.rejects(generateSolution(choice), /结构不完整/);
  }));
