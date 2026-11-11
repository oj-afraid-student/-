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
import { NextRequest } from 'next/server.js';
const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const bank = JSON.parse(await read('fixtures/server/question-bank.json'));
const expected = JSON.parse(await read('fixtures/api/practice/result-response.json')).data;
const error = (status) => (e) => e.status === status;

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
