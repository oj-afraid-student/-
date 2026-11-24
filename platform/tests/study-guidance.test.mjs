import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { generateStudyGuidance } = await import('../src/server/ai/study-guidance.ts');
const { studyInputSchema } = await import('../src/shared/study-contract.ts');
const problem = {
  title: '两问空间几何',
  text: '原始完整题干',
  conditions: ['已知条件'],
  questions: ['证明平面垂直', '求二面角'],
  uncertainties: [],
};
const input = {
  action: 'hint',
  problem,
  question: 1,
  progress: '准备过棱上同一点作两条垂线',
  followup: '',
  previousProgress: [{ question: 0, progress: '前问中已得到平面垂直关系' }],
};
test('study history accepts earlier subquestions and rejects duplicated, future or oversized context', () => {
  assert.equal(studyInputSchema.safeParse(input).success, true);
  for (const previousProgress of [
    [{ question: 1, progress: '当前问' }],
    [{ question: 2, progress: '未来问' }],
    [input.previousProgress[0], input.previousProgress[0]],
  ])
    assert.equal(studyInputSchema.safeParse({ ...input, previousProgress }).success, false);
  const legacy = { ...input };
  delete legacy.previousProgress;
  assert.equal(studyInputSchema.safeParse(legacy).success, true);
  assert.equal(
    studyInputSchema.safeParse({
      ...input,
      previousProgress: [{ question: 0, progress: '字'.repeat(12001) }],
    }).success,
    false,
  );
});

test('next-step truncation retries original target and prior work without replacing the problem', async () => {
  const fetchBefore = globalThis.fetch;
  const keys = ['ZHIXU_AI_API_KEY', 'ZHIXU_AI_BASE_URL', 'ZHIXU_AI_MODEL'];
  const before = keys.map((key) => process.env[key]);
  Object.assign(process.env, {
    ZHIXU_AI_API_KEY: 'test-only',
    ZHIXU_AI_BASE_URL: 'https://example.test',
    ZHIXU_AI_MODEL: 'test',
  });
  const calls = [];
  const guidance = {
    hint: '这个方向正确。保持两条垂线过棱上同一点，再辨认所成角。',
    check: '两条线的交点是否在棱上？',
    limitations: [],
  };
  try {
    globalThis.fetch = async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return Response.json({
        choices: [
          {
            finish_reason: calls.length === 1 ? 'length' : 'stop',
            message: { content: calls.length === 1 ? '{' : JSON.stringify(guidance) },
          },
        ],
      });
    };
    assert.deepEqual(await generateStudyGuidance(input), guidance);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].max_tokens, 8000);
    assert.deepEqual(calls[0].messages[1], calls[1].messages[1]);
    const context = JSON.parse(calls[1].messages[1].content);
    assert.equal(context.target.index, 1);
    assert.equal(context.target.text, problem.questions[1]);
    assert.equal(context.previousProgress[0].progress, input.previousProgress[0].progress);
    assert.equal(context.studentProgress, input.progress);
    assert.match(calls[1].messages[0].content, /不要改题、删改条件、退回第一小问/);
    assert.doesNotMatch(calls[1].messages[0].content, /使用容易核验的数据/);
    const count = calls.length;
    await assert.rejects(generateStudyGuidance({ ...input, question: 9 }), /作答上下文/);
    assert.equal(calls.length, count);
    globalThis.fetch = async () =>
      Response.json({
        choices: [{ finish_reason: 'stop', message: { content: '{"hint":"缺少字段"}' } }],
      });
    await assert.rejects(generateStudyGuidance(input), /提示结构不完整/);
  } finally {
    globalThis.fetch = fetchBefore;
    keys.forEach((key, index) =>
      before[index] === undefined ? delete process.env[key] : (process.env[key] = before[index]),
    );
  }
});
