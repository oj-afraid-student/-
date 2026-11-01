// Run explicitly against pnpm dev with ZHIXU_DEV_FIXTURES=1.
// This validates the development HTTP adapter, not production business services.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const origin = process.env.ZHIXU_TEST_URL ?? 'http://127.0.0.1:3000';
const samplePractice = JSON.parse(
  readFileSync(new URL('../fixtures/api/practice/create-response.json', import.meta.url), 'utf8'),
).data;
const sampleAnswers = JSON.parse(
  readFileSync(new URL('../fixtures/api/practice/submit-request.json', import.meta.url), 'utf8'),
).answers;
const byQuestion = new Map(
  samplePractice.items.map((item) => [
    item.question.id,
    sampleAnswers.find((answer) => answer.practiceItemId === item.id).answer,
  ]),
);
function agent() {
  let cookie = '';
  return async (path, method = 'GET', body) => {
    const response = await fetch(`${origin}/api/development${path}`, {
      method,
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.headers.has('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, ...(await response.json()) };
  };
}
test('开发 HTTP 闭环：注册不自动登录、24题、提交去重、待复核、分页、重登与隔离', async () => {
  const a = agent(),
    b = agent();
  const credentials = { username: `test_${Date.now().toString(36)}`, password: ' space password ' };
  assert.equal((await a('/auth/me')).status, 401);
  assert.equal((await a('/auth/register', 'POST', credentials)).status, 201);
  assert.equal((await a('/auth/me')).status, 401);
  assert.equal((await a('/auth/register', 'POST', credentials)).status, 409);
  assert.equal(
    (await a('/auth/login', 'POST', { ...credentials, password: credentials.password.trim() }))
      .status,
    401,
  );
  assert.equal((await a('/auth/login', 'POST', credentials)).status, 200);
  assert.equal((await a('/auth/me')).data.username, credentials.username);
  assert.deepEqual((await a('/me/submissions')).data.items, []);
  const units = (await a('/knowledge-points')).data;
  assert.equal(units.length, 6);
  assert.equal((await a('/knowledge-points/SG-01')).data.sections.length, 4);
  const created = await a('/practices', 'POST', { mode: 'ALL' });
  assert.equal(created.status, 201);
  const practice = created.data;
  assert.equal(practice.items.length, 24);
  assert.ok(!JSON.stringify(practice).includes('correctOptionIds'));
  assert.ok(!JSON.stringify(practice).includes('reference'));
  const answers = practice.items.map((item) => ({
    practiceItemId: item.id,
    answer: structuredClone(byQuestion.get(item.question.id)),
  }));
  const path = `/practices/${practice.id}/submit`;
  assert.equal((await a(path, 'POST', { answers: answers.slice(0, -1) })).status, 400);
  assert.equal((await a(`/practices/${practice.id}`)).data.status, 'OPEN');
  const badQ14 = structuredClone(answers),
    q14 = practice.items.find((item) => item.question.id === 'Q14');
  badQ14.find((answer) => answer.practiceItemId === q14.id).answer.blanks[0].values.pop();
  assert.equal((await a(path, 'POST', { answers: badQ14 })).status, 400);
  const first = await a(path, 'POST', { answers });
  assert.equal(first.status, 201);
  const reordered = structuredClone(answers).reverse();
  for (const answer of reordered) {
    if (answer.answer.type === 'MULTIPLE_CHOICE') answer.answer.selectedOptionIds.reverse();
    if (answer.practiceItemId === q14.id) answer.answer.blanks[0].values.reverse();
  }
  const repeat = await a(path, 'POST', { answers: reordered });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.data.submissionId, first.data.submissionId);
  const changed = structuredClone(answers);
  changed[0].answer.selectedOptionId = 'A';
  assert.equal((await a(path, 'POST', { answers: changed })).status, 409);
  const detail = (await a(`/me/submissions/${first.data.submissionId}`)).data;
  assert.equal(detail.gradedCount, 11);
  assert.equal(detail.pendingCount, 13);
  assert.equal(detail.correctCount, 11);
  assert.equal(detail.score, null);
  assert.equal(detail.items.length, 24);
  assert.ok(
    detail.items
      .filter((item) => item.evaluation.status === 'PENDING_REVIEW')
      .every((item) => item.evaluation.isCorrect === null && item.evaluation.score === null),
  );
  assert.equal((await a(`/practices/${practice.id}`)).data.submissionId, detail.id);
  assert.ok(!JSON.stringify((await a(`/practices/${practice.id}`)).data).includes('reference'));
  assert.equal((await a('/me/submissions?page=1&pageSize=1')).data.total, 1);
  assert.deepEqual((await a('/me/submissions?page=2&pageSize=1')).data.items, []);
  assert.equal((await a('/me/submissions?page=1.5')).status, 400);
  assert.equal((await a('/me/submissions?extra=1')).status, 400);
  const bc = { username: `other_${Date.now().toString(36)}`, password: 'other-password' };
  await b('/auth/register', 'POST', bc);
  await b('/auth/login', 'POST', bc);
  assert.equal((await b(`/practices/${practice.id}`)).status, 404);
  assert.equal((await b(`/me/submissions/${detail.id}`)).status, 404);
  assert.equal((await b('/me/submissions')).data.total, 0);
  assert.equal((await a('/auth/logout', 'POST')).status, 200);
  assert.equal((await a('/auth/me')).status, 401);
  assert.equal((await a('/auth/logout', 'POST')).status, 200);
  await a('/auth/login', 'POST', credentials);
  assert.equal((await a('/me/submissions')).data.total, 1);
  assert.equal(
    (await a('/practices', 'POST', { mode: 'FILTERED', knowledgePointId: 'SG-01', count: 99 }))
      .status,
    409,
  );
  assert.equal(
    (await a('/practices', 'POST', { mode: 'FILTERED', knowledgePointId: 'not-a-unit' })).status,
    404,
  );
  const explicit = await a('/practices', 'POST', {
    mode: 'EXPLICIT',
    questionIds: ['Q24', 'Q06', 'Q14'],
  });
  assert.deepEqual(
    explicit.data.items.map((item) => item.question.id),
    ['Q24', 'Q06', 'Q14'],
  );
  const graded = (await a('/practices', 'POST', { mode: 'EXPLICIT', questionIds: ['Q01', 'Q03'] }))
    .data;
  const gradedAnswers = graded.items.map((item) => ({
    practiceItemId: item.id,
    answer: structuredClone(byQuestion.get(item.question.id)),
  }));
  gradedAnswers[0].answer.selectedOptionId = 'A';
  const gradedSubmit = await a(`/practices/${graded.id}/submit`, 'POST', {
    answers: gradedAnswers,
  });
  const gradedResult = (await a(`/me/submissions/${gradedSubmit.data.submissionId}`)).data;
  assert.equal(gradedResult.gradingStatus, 'GRADED');
  assert.equal(gradedResult.score, 1);
  assert.equal(gradedResult.items[0].evaluation.status, 'INCORRECT');
  const unknown = (await a('/practices', 'POST', { mode: 'EXPLICIT', questionIds: ['Q02'] })).data;
  const unknownSubmit = await a(`/practices/${unknown.id}/submit`, 'POST', {
    answers: [
      {
        practiceItemId: unknown.items[0].id,
        answer: { type: 'FILL_BLANK', blanks: [{ blankId: 'b1', values: ['未枚举表达式'] }] },
      },
    ],
  });
  assert.equal(
    (await a(`/me/submissions/${unknownSubmit.data.submissionId}`)).data.gradingStatus,
    'PENDING_REVIEW',
  );
  const real = await fetch(`${origin}/api/v1/auth/me`);
  assert.notEqual(real.status, 200, '开发服务不得接管正式业务地址');
});
