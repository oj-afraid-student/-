import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const {
  createPractice,
  getPractice,
  submitPractice,
  getSubmission,
  listSubmissions,
  historyQuery,
} = await import('../src/server/practice/service.ts');
const { readAnswer, evaluate, canonical, selection } =
  await import('../src/server/practice/rules.ts');
const { publicQuestion } = await import('../src/server/practice/catalog.ts');
const { readJson } = await import('../src/server/practice/request.ts');
const { generateCandidate, requestHint } = await import('../src/server/ai/learning.ts');
const { candidateScopes } = await import('../src/server/ai/scope.ts');
const { publishCandidate } = await import('../src/server/ai/publish.ts');
const { getStudentProgress } = await import('../src/server/progress/service.ts');
import { NextRequest } from 'next/server.js';
const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const bank = JSON.parse(await read('fixtures/server/question-bank.json'));
const expected = JSON.parse(await read('fixtures/api/practice/result-response.json')).data;
const error = (status) => (e) => e.status === status;

test('在线复核发布校验权限与知识点，重复请求不重复入库', async (t) => {
  await setup(t);
  const prior = process.env.ZHIXU_QUESTION_REVIEWER_IDS;
  process.env.ZHIXU_QUESTION_REVIEWER_IDS = users[0];
  t.after(() => {
    if (prior === undefined) delete process.env.ZHIXU_QUESTION_REVIEWER_IDS;
    else process.env.ZHIXU_QUESTION_REVIEWER_IDS = prior;
  });
  await db.query(
    "INSERT INTO knowledge_point (id,title,sort_order,content) VALUES ('SG-01','空间关系',1,$1)",
    [{ sections: [], knowledgeIds: ['G1-01'] }],
  );
  const input = {
    requestId: 'e725ed13-ac40-490a-b289-f3802cfa3161',
    confirmed: true,
    title: '复核后标题',
    stem: '选择正确的说法。',
    fields: ['甲', '乙'],
    answers: ['2'],
    explanation: '乙符合条件。',
    knowledgeId: 'G1-01',
    type: 'SINGLE_CHOICE',
    difficulty: 'BASIC',
  };
  await assert.rejects(publishCandidate(users[1], input), error(403));
  await assert.rejects(publishCandidate(users[0], { ...input, confirmed: false }), error(400));
  await assert.rejects(publishCandidate(users[0], { ...input, knowledgeId: 'G8-02' }), error(400));
  await assert.rejects(publishCandidate(users[0], { ...input, answers: ['3'] }), error(400));
  const result = await publishCandidate(users[0], input);
  assert.deepEqual(await publishCandidate(users[0], input), result);
  await assert.rejects(publishCandidate(users[0], { ...input, title: '重复请求改题' }), error(409));
  const paper = await createPractice(users[1], { mode: 'EXPLICIT', questionIds: [result.id] });
  assert.equal(paper.items[0].question.title, input.title);
  assert.equal('reference' in paper.items[0].question, false);
  const item = paper.items[0];
  const submission = await submitPractice(users[1], paper.id, {
    answers: [
      { practiceItemId: item.id, answer: { type: 'SINGLE_CHOICE', selectedOptionId: 'B' } },
    ],
  });
  const detail = await getSubmission(users[1], submission.data.submissionId);
  assert.equal(detail.items[0].evaluation.status, 'CORRECT');
  assert.equal(detail.items[0].reference.explanation, input.explanation);
});

test('扩充知识点可用于候选出题，组卷仅取已发布且匹配细分标签的题', async (t) => {
  await setup(t);
  const scopes = await candidateScopes();
  assert.equal(scopes.length, 15);
  assert.equal(scopes.flatMap((unit) => unit.points).length, 39);
  const expanded = scopes.find((unit) => unit.id === 'SG-11');
  assert.ok(expanded.points.every((point) => point.preview));
  await assert.rejects(
    generateCandidate({
      knowledgeId: 'UNKNOWN',
      difficulty: 'BASIC',
      type: 'SINGLE_CHOICE',
    }),
    error(400),
  );
  const entry = bank[0];
  const knowledgePointId = entry.question.knowledgeIds[0];
  await assert.rejects(
    createPractice(users[0], {
      mode: 'FILTERED',
      knowledgePointId,
      count: 1,
    }),
    /只有 0 道/,
  );
  await db.query('UPDATE question_version SET is_published=true WHERE question_key=$1', [
    entry.question.id,
  ]);
  const paper = await createPractice(users[0], { mode: 'FILTERED', knowledgePointId, count: 1 });
  assert.equal(paper.items[0].question.id, entry.question.id);
});

test('解题提示只读取本人练习的固定题目版本，不发送参考答案', async (t) => {
  await setup(t);
  await db.query("UPDATE question_version SET is_published=true WHERE question_key='Q01'");
  const practice = await createPractice(users[0], { mode: 'EXPLICIT', questionIds: ['Q01'] });
  const item = practice.items[0];
  const config = {
    ZHIXU_AI_BASE_URL: 'https://model.invalid/v1',
    ZHIXU_AI_API_KEY: 'test-key',
    ZHIXU_AI_MODEL: 'test-model',
  };
  for (const [key, value] of Object.entries(config)) {
    const prior = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    });
  }
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1];
    assert.deepEqual(JSON.parse(prompt.content), item.question);
    return Response.json({
      choices: [
        { finish_reason: 'stop', message: { content: '{"hint":"先观察两条直线是否共面。"}' } },
      ],
    });
  });
  await assert.rejects(requestHint(users[1], practice.id, { itemId: item.id }), error(404));
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(await requestHint(users[0], practice.id, { itemId: item.id }), {
    hint: '先观察两条直线是否共面。',
    version: item.question.version,
  });

  await db.query("UPDATE question_version SET is_published=true WHERE question_key='Q24'");
  const written = await createPractice(users[0], { mode: 'EXPLICIT', questionIds: ['Q24'] });
  const question = written.items[0].question;
  const itemId = written.items[0].id;
  const target = question.parts[1];
  const progress = '第一问已证线面垂直，第二问已求底面积。';
  await assert.rejects(requestHint(users[0], written.id, { itemId }), error(400));
  await assert.rejects(
    requestHint(users[0], written.id, { itemId, partId: 'unknown' }),
    error(400),
  );
  await assert.rejects(
    requestHint(users[0], written.id, { itemId, partId: target.id, photo: 'bad' }),
    error(400),
  );
  fetch.mock.mockImplementationOnce(async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1];
    assert.deepEqual(JSON.parse(prompt.content), { question, target, studentProgress: progress });
    return Response.json({
      choices: [
        { finish_reason: 'stop', message: { content: '{"hint":"用垂直关系找到棱锥的高。"}' } },
      ],
    });
  });
  assert.equal(
    (await requestHint(users[0], written.id, { itemId, partId: target.id, progress })).hint,
    '用垂直关系找到棱锥的高。',
  );
  fetch.mock.mockImplementationOnce(async (_url, options) => {
    const content = JSON.parse(options.body).messages[1].content;
    assert.equal(content[1].type, 'image_url');
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content: '{"text":"底面积等于4。"}' } }],
    });
  });
  assert.deepEqual(
    await requestHint(users[0], written.id, {
      itemId,
      partId: target.id,
      photo: 'data:image/jpeg;base64,/9j/AA==',
    }),
    { text: '底面积等于4。' },
  );
});

// One PGlite connection needs transaction serialization. This exercises persisted state and
// rollback, but real PostgreSQL row-lock races require the separate PostgreSQL integration run.
let db,
  users,
  tail = Promise.resolve();
async function setup(t) {
  db = new PGlite();
  await db.exec(await read('db/migrations/001_initial.sql'));
  await db.exec(await read('db/migrations/002_practice_v2.sql'));
  process.env.DATABASE_URL = 'postgresql://test-only';
  globalThis.zhixuPool = {
    async connect() {
      const wait = tail;
      let release;
      tail = new Promise((resolve) => {
        release = resolve;
      });
      await wait;
      return { query: (sql, args) => db.query(sql, args), release };
    },
  };
  users = (
    await db.query(
      "INSERT INTO app_user (username, password_hash) VALUES ('user_one','test'),('user_two','test') RETURNING id",
    )
  ).rows.map((r) => r.id);
  for (const record of bank) await insertVersion(record);
  t.after(async () => {
    delete globalThis.zhixuPool;
    await db.close();
  });
}
async function insertVersion(record, published = false) {
  const { question, reference, grading, source } = record;
  await db.query(
    `INSERT INTO question_version (question_key, version, public_question, reference_answer, grading, source, is_published)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [question.id, question.version, question, reference, grading, source, published],
  );
}
const payload = (practice) => ({
  answers: practice.items.map((item) => ({
    practiceItemId: item.id,
    answer: structuredClone(
      expected.items.find((entry) => entry.question.id === item.question.id).answer,
    ),
  })),
});

test('学习画像统计已提交的原题版本，排除待复核分母且按学生隔离', async (t) => {
  await setup(t);
  const pointIds = ['G1-01', 'G1-02', 'G1-03'];
  await db.query(
    "INSERT INTO knowledge_point (id,title,sort_order,content) VALUES ('SG-01','空间位置关系',1,$1)",
    [{ knowledgeIds: pointIds, sections: [] }],
  );
  const record = structuredClone(bank.find((entry) => entry.question.id === 'Q01'));
  const firstTag = pointIds[0];
  record.question.version = 2;
  record.question.knowledgeIds = [firstTag, firstTag, pointIds[1]];
  await insertVersion(record, true);
  await db.query("UPDATE question_version SET is_published=true WHERE question_key='Q24'");

  const [student, other] = users;
  const first = await createPractice(student, { mode: 'EXPLICIT', questionIds: ['Q01', 'Q24'] });
  const empty = await getStudentProgress(student);
  assert.equal(empty.submissionCount, 0);
  assert.equal(empty.overall.accuracy, null);
  assert.deepEqual(
    empty.points.map((point) => point.status),
    pointIds.map(() => 'NO_ATTEMPTS'),
  );

  await submitPractice(student, first.id, payload(first));
  await submitPractice(student, first.id, payload(first));
  const afterFirst = await getStudentProgress(student);
  assert.equal(afterFirst.submissionCount, 1);
  assert.deepEqual(afterFirst.overall, {
    attemptCount: 2,
    gradedCount: 1,
    correctCount: 1,
    accuracy: 1,
  });
  assert.equal(afterFirst.points.find((point) => point.id === firstTag).attemptCount, 1);
  assert.equal(
    afterFirst.points.find((point) => point.id === firstTag).status,
    'INSUFFICIENT_EVIDENCE',
  );
  assert.equal(afterFirst.points.find((point) => point.id === 'E3').accuracy, null);

  const repeat = () => createPractice(student, { mode: 'EXPLICIT', questionIds: ['Q01'] });
  const second = await repeat();
  const wrong = payload(second);
  wrong.answers[0].answer.selectedOptionId = 'A';
  await submitPractice(student, second.id, wrong);
  const third = await repeat();
  const latest = await submitPractice(student, third.id, payload(third));
  await db.query("UPDATE submission SET submitted_at = now() + interval '1 second' WHERE id = $1", [
    latest.data.submissionId,
  ]);

  record.question.version = 3;
  record.question.knowledgeIds = [pointIds[2]];
  await insertVersion(record, true);
  const profile = await getStudentProgress(student);
  assert.equal(profile.submissionCount, 3);
  assert.equal(profile.minimumGradedCount, 3);
  assert.equal(profile.overall.attemptCount, 4);
  assert.equal(profile.overall.accuracy, 2 / 3);
  for (const id of pointIds.slice(0, 2)) {
    const point = profile.points.find((entry) => entry.id === id);
    assert.equal(point.attemptCount, 3);
    assert.equal(point.gradedCount, 3);
    assert.equal(point.accuracy, 2 / 3);
    assert.equal(point.status, 'ENOUGH_EVIDENCE');
    assert.equal(point.latestSubmissionId, latest.data.submissionId);
  }
  assert.equal(profile.points.find((point) => point.id === pointIds[2]).status, 'NO_ATTEMPTS');
  assert.deepEqual(await getStudentProgress(other), empty);
});

test('正式服务：发布边界、24题保存、权限、幂等、分页、版本与重练', async (t) => {
  await setup(t);
  await assert.rejects(createPractice(users[0], { mode: 'ALL' }), error(404));
  await db.query('UPDATE question_version SET is_published = true');
  const practice = await createPractice(users[0], { mode: 'ALL' });
  assert.equal(practice.totalCount, 24);
  assert.equal(new Set(practice.items.map((i) => i.question.type)).size, 8);
  assert.equal(
    /reference|grading|acceptedValues|correctOptionIds/.test(JSON.stringify(practice)),
    false,
  );
  await assert.rejects(getPractice(users[1], practice.id), error(404));
  await assert.rejects(submitPractice(users[1], practice.id, payload(practice)), error(404));
  await assert.rejects(getPractice(users[0], 'not-a-uuid'), error(404));
  const original = payload(practice);
  const first = await submitPractice(users[0], practice.id, original);
  assert.equal(first.created, true);
  const result = await getSubmission(users[0], first.data.submissionId);
  assert.equal(result.correctCount, 11);
  assert.equal(result.pendingCount, 13);
  assert.equal(result.score, null);
  assert.deepEqual(
    result.items.map((i) => i.answer),
    expected.items.map((i) => i.answer),
  );
  const retry = structuredClone(original);
  retry.answers.reverse();
  for (const { answer } of retry.answers) {
    if (answer.selectedOptionIds) answer.selectedOptionIds.reverse();
    if (answer.parts) {
      answer.parts.reverse();
      answer.parts[0].text += '  ';
    }
    if (answer.blanks) answer.blanks.reverse();
  }
  const repeated = await submitPractice(users[0], practice.id, retry);
  assert.equal(repeated.created, false);
  assert.deepEqual(repeated.data, first.data);
  const changed = structuredClone(original);
  const choice = changed.answers.find((a) => a.answer.type === 'SINGLE_CHOICE');
  choice.answer.selectedOptionId = choice.answer.selectedOptionId === 'A' ? 'B' : 'A';
  await assert.rejects(submitPractice(users[0], practice.id, changed), error(409));
  await assert.rejects(getSubmission(users[1], result.id), error(404));
  assert.equal((await getPractice(users[0], practice.id)).submissionId, result.id);
  assert.equal((await listSubmissions(users[1], new URLSearchParams())).total, 0);
  const page = await listSubmissions(users[0], new URLSearchParams('pageSize=1'));
  assert.equal(page.total, 1);
  assert.equal(page.items[0].id, result.id);
  assert.equal('items' in page.items[0], false);
  assert.deepEqual(
    (await listSubmissions(users[0], new URLSearchParams('page=9007199254740991&pageSize=100')))
      .items,
    [],
  );
  const newVersion = structuredClone(bank[0]);
  newVersion.question.version = 2;
  newVersion.reference.explanation = '新版解析';
  await insertVersion(newVersion, true);
  await db.query(
    "UPDATE question_version SET is_published = false WHERE question_key = 'Q01' AND version = 1",
  );
  const redo = await createPractice(users[0], { mode: 'EXPLICIT', questionIds: ['Q01'] });
  assert.notEqual(redo.id, practice.id);
  assert.equal(redo.items[0].question.version, 2);
  const old = await getSubmission(users[0], result.id);
  assert.equal(old.items[0].question.version, 1);
  assert.notEqual(old.items[0].reference.explanation, '新版解析');
  assert.equal((await submitPractice(users[0], practice.id, original)).created, false);
});

test('正式服务：5道选择题3/5、并行重试只存一份、错题重练保留旧结果', async (t) => {
  await setup(t);
  await db.query('UPDATE question_version SET is_published = true');
  const practice = await createPractice(users[0], {
    mode: 'FILTERED',
    questionTypes: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'],
    count: 5,
  });
  const request = payload(practice);
  for (const entry of request.answers.slice(3)) {
    const q = practice.items.find((i) => i.id === entry.practiceItemId).question;
    const rule = bank.find((r) => r.question.id === q.id).grading;
    const wrong = q.options.find((o) => !rule.correctOptionIds.includes(o.id)).id;
    entry.answer =
      q.type === 'SINGLE_CHOICE'
        ? { type: q.type, selectedOptionId: wrong }
        : { type: q.type, selectedOptionIds: [wrong] };
  }
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => submitPractice(users[0], practice.id, request)),
  );
  assert.equal(responses.filter((r) => r.created).length, 1);
  assert.equal(new Set(responses.map((r) => r.data.submissionId)).size, 1);
  const detail = await getSubmission(users[0], responses[0].data.submissionId);
  assert.equal(detail.score, 3);
  assert.equal(detail.maxScore, 5);
  const wrongIds = detail.items
    .filter((i) => i.evaluation.status === 'INCORRECT')
    .map((i) => i.question.id);
  assert.equal(wrongIds.length, 2);
  const retry = await createPractice(users[0], { mode: 'EXPLICIT', questionIds: wrongIds });
  assert.equal(retry.totalCount, 2);
  assert.equal((await getSubmission(users[0], detail.id)).score, 3);
  assert.equal((await db.query('SELECT count(*) FROM submission')).rows[0].count, 1);
});

test('正式服务：非法提交零写入、写入中途失败回滚、恢复原答案可重试', async (t) => {
  await setup(t);
  await db.query('UPDATE question_version SET is_published = true');
  const practice = await createPractice(users[0], { mode: 'ALL' });
  const good = payload(practice);
  const mutations = [
    (v) => v.answers.pop(),
    (v) => v.answers.push(v.answers[0]),
    (v) => {
      v.answers[0].answer.selectedOptionId = 'INVALID';
    },
    (v) => {
      v.userId = users[1];
    },
    (v) => {
      v.answers[0].answer.score = 1;
    },
    (v) => {
      v.answers.find((a) => a.answer.parts).answer.parts.pop();
    },
    (v) => {
      v.answers.find((a) => a.answer.blanks).answer.blanks[0].values = [];
    },
    (v) => {
      v.answers.find((a) => a.answer.judgments).answer.judgments[0].value = 'true';
    },
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(good);
    mutate(bad);
    await assert.rejects(submitPractice(users[0], practice.id, bad), error(400));
  }
  await db.exec(`CREATE FUNCTION fail_answer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF (SELECT count(*) FROM submission_answer) >= 2 THEN RAISE EXCEPTION 'injected save failure'; END IF;
    RETURN NEW; END $$;
    CREATE TRIGGER fail_answer BEFORE INSERT ON submission_answer FOR EACH ROW EXECUTE FUNCTION fail_answer();`);
  await assert.rejects(submitPractice(users[0], practice.id, good), /injected save failure/);
  assert.equal((await db.query('SELECT count(*) FROM submission')).rows[0].count, 0);
  assert.equal((await db.query('SELECT count(*) FROM submission_answer')).rows[0].count, 0);
  assert.equal((await getPractice(users[0], practice.id)).status, 'OPEN');
  await db.exec('DROP TRIGGER fail_answer ON submission_answer');
  assert.equal((await submitPractice(users[0], practice.id, good)).created, true);
});

test('判题与规范化：别名、无序多值、一一匹配、未知表达式待复核', () => {
  for (const record of bank) {
    const sample = expected.items.find((i) => i.question.id === record.question.id);
    assert.deepEqual(evaluate(record, readAnswer(record, sample.answer)), sample.evaluation);
  }
  const q14 = bank.find((r) => r.question.id === 'Q14');
  const answer = structuredClone(expected.items.find((i) => i.question.id === 'Q14').answer);
  const original = canonical(q14, answer);
  answer.blanks[0].values.reverse();
  assert.deepEqual(canonical(q14, answer), original);
  assert.equal(evaluate(q14, answer).status, 'CORRECT');
  answer.blanks[0].values[0] = '未枚举等价式';
  assert.equal(evaluate(q14, answer).status, 'PENDING_REVIEW');
  const overlap = structuredClone(q14);
  overlap.grading.blanks[0].acceptedValues = [['x', 'y'], ['x']];
  answer.blanks[0].values = ['x', 'y'];
  assert.equal(evaluate(overlap, answer).status, 'CORRECT');
  answer.blanks[0].values = ['y', 'y'];
  assert.equal(evaluate(overlap, answer).status, 'PENDING_REVIEW');
  assert.equal('grading' in publicQuestion({ ...bank[0].question, grading: 'secret' }), false);
});

test('创建与分页严格拒绝旧五题契约、额外字段、重复参数和非法类型', () => {
  for (const value of [
    { knowledgePointId: 'SG-01' },
    { mode: 'ALL', count: 5 },
    { mode: 'EXPLICIT', questionIds: ['Q01', 'Q01'] },
    { mode: 'FILTERED', difficulty: ['BASIC'] },
    { mode: 'FILTERED', count: 0 },
    { mode: 'FILTERED', questionTypes: ['UNKNOWN'] },
  ])
    assert.throws(() => selection(value, bank), error(400));
  for (const query of [
    'page=0',
    'page=1&page=2',
    'page=1.5',
    'pageSize=101',
    'userId=x',
    'page=9007199254740992',
  ])
    assert.throws(() => historyQuery(new URLSearchParams(query)), error(400));
  assert.deepEqual(historyQuery(new URLSearchParams()), { page: 1, pageSize: 20 });
});

test('请求边界：JSON类型、解析错误和流式1MiB限制', async () => {
  const req = (body, headers = { 'content-type': 'application/json' }) =>
    new NextRequest('http://localhost/api/v1/practices', { method: 'POST', headers, body });
  assert.deepEqual(await readJson(req('{"mode":"ALL"}')), { mode: 'ALL' });
  await assert.rejects(readJson(req('{}', {})), error(400));
  await assert.rejects(readJson(req('{')), error(400));
  await assert.rejects(readJson(req(' '.repeat(1024 * 1024 + 1))), error(400));
});

test('选题固定版本：草稿新版不遮蔽旧版、显式题序、跨单元、创建失败回滚', async (t) => {
  await setup(t);
  await db.query('UPDATE question_version SET is_published=true');
  const draft = structuredClone(bank[0]);
  draft.question.version = 2;
  draft.reference.explanation = '未发布新版';
  await insertVersion(draft);
  const p = await createPractice(users[0], {
    mode: 'EXPLICIT',
    questionIds: ['Q14', 'Q01', 'Q24'],
  });
  assert.deepEqual(
    p.items.map((i) => i.question.id),
    ['Q14', 'Q01', 'Q24'],
  );
  assert.equal(p.items[1].question.version, 1);
  await db.query(
    "UPDATE question_version SET is_published=true WHERE question_key='Q01' AND version=2",
  );
  const submission = await submitPractice(users[0], p.id, payload(p));
  assert.equal(
    (await getSubmission(users[0], submission.data.submissionId)).items[1].question.version,
    1,
  );
  const cross = bank.find((r) => r.question.unitIds.length > 1);
  assert.ok(cross);
  for (const unit of cross.question.unitIds) {
    const filtered = await createPractice(users[0], { mode: 'FILTERED', knowledgePointId: unit });
    assert.equal(filtered.items.filter((i) => i.question.id === cross.question.id).length, 1);
  }
  await assert.rejects(
    createPractice(users[0], { mode: 'FILTERED', questionTypes: ['SINGLE_CHOICE'], count: 4 }),
    error(409),
  );
  await assert.rejects(
    createPractice(users[0], { mode: 'FILTERED', knowledgePointId: 'missing' }),
    error(404),
  );
  const before = (await db.query('SELECT count(*) FROM practice')).rows[0].count;
  await db.exec(`CREATE FUNCTION fail_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.position=2 THEN RAISE EXCEPTION 'injected item failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_item BEFORE INSERT ON practice_item FOR EACH ROW EXECUTE FUNCTION fail_item();`);
  await assert.rejects(createPractice(users[0], { mode: 'ALL' }), /injected item failure/);
  assert.equal((await db.query('SELECT count(*) FROM practice')).rows[0].count, before);
});

test('八题型校验：额外嵌套字段、空文本、超长文本、空号与判断类型', () => {
  for (const record of bank) {
    const valid = expected.items.find((i) => i.question.id === record.question.id).answer;
    assert.throws(() => readAnswer(record, { ...valid, type: 'UNKNOWN' }), error(400));
    assert.throws(() => readAnswer(record, { ...valid, userId: 'forged' }), error(400));
    const a = structuredClone(valid);
    if (a.parts) {
      a.parts[0].text = ' '.repeat(10);
      assert.throws(() => readAnswer(record, a), error(400));
      a.parts[0].text = 'x'.repeat(10001);
      assert.throws(() => readAnswer(record, a), error(400));
      a.parts[0].text = 'valid';
      a.parts[0].score = 1;
    } else if (a.judgments) {
      a.judgments[0].reason = 123;
    } else if (a.blanks) {
      a.blanks[0].values[0] = 'x'.repeat(201);
      assert.throws(() => readAnswer(record, a), error(400));
      a.blanks[0].blankId = 'unknown';
    } else if (a.selectedOptionIds) a.selectedOptionIds.push(a.selectedOptionIds[0]);
    else a.selectedOptionId = 1;
    assert.throws(() => readAnswer(record, a), error(400));
  }
});

test('v0.2对接：保留原文，规范化重试不覆盖原答案，混入其他练习题项零写入', async (t) => {
  await setup(t);
  await db.query('UPDATE question_version SET is_published=true');
  const ids = ['Q03', 'Q05', 'Q06', 'Q14', 'Q24'];
  const practice = await createPractice(users[0], { mode: 'EXPLICIT', questionIds: ids });
  const other = await createPractice(users[0], { mode: 'EXPLICIT', questionIds: ids });
  const request = payload(practice);
  const mixed = structuredClone(request);
  mixed.answers[0].practiceItemId = other.items[0].id;
  await assert.rejects(submitPractice(users[0], practice.id, mixed), error(400));
  assert.equal((await db.query('SELECT count(*) FROM submission')).rows[0].count, 0);
  assert.equal((await getPractice(users[0], practice.id)).status, 'OPEN');
  for (const { answer } of request.answers) {
    if (answer.blanks)
      for (const blank of answer.blanks)
        blank.values = blank.values.map((v) => `  ${[...v].join(' ')}  `);
    if (answer.judgments) answer.judgments[0].reason = '  条件 Ａ　∥ Ｂ；所以 a + b = c。  ';
    if (answer.parts) answer.parts[0].text = '  由 Ａ　∥ Ｂ，得 a + b = c。  ';
  }
  const first = await submitPractice(users[0], practice.id, request);
  const saved = await getSubmission(users[0], first.data.submissionId);
  const normalize = (v) => v.normalize('NFKC').replace(/\s/g, '');
  const retry = structuredClone(request);
  for (const { answer } of retry.answers) {
    if (answer.blanks)
      for (const blank of answer.blanks) blank.values = blank.values.map(normalize);
    if (answer.judgments)
      for (const entry of answer.judgments) entry.reason = normalize(entry.reason);
    if (answer.parts) for (const part of answer.parts) part.text = normalize(part.text);
  }
  const repeated = await submitPractice(users[0], practice.id, retry);
  assert.equal(repeated.created, false);
  assert.deepEqual(repeated.data, first.data);
  assert.deepEqual(await getSubmission(users[0], first.data.submissionId), saved);
  for (const item of saved.items) {
    const original = request.answers.find((a) => a.practiceItemId === item.practiceItemId).answer;
    if (item.answer.blanks) {
      assert.deepEqual(
        item.answer.blanks,
        original.blanks.map((blank) => ({ ...blank, values: blank.values.map((v) => v.trim()) })),
      );
      assert.equal(item.evaluation.status, 'CORRECT');
    }
    if (item.answer.judgments)
      assert.equal(item.answer.judgments[0].reason, original.judgments[0].reason.trim());
    if (item.answer.parts) assert.equal(item.answer.parts[0].text, original.parts[0].text.trim());
  }
});
