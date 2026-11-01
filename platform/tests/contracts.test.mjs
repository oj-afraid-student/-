import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const bank = read('fixtures/server/question-bank.json');
const questions = read('fixtures/content/questions.json');
const practice = read('fixtures/api/practice/create-response.json').data;
const submit = read('fixtures/api/practice/submit-request.json');
const result = read('fixtures/api/practice/result-response.json').data;
const normalize = (s) => s.normalize('NFKC').replace(/\s/g, '').replaceAll('／', '/');

test('Q01—Q24 全覆盖、来源文件哈希一致、学生版核对由导入器执行', () => {
  assert.deepEqual(
    questions.map((q) => q.id),
    Array.from({ length: 24 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`),
  );
  const manifest = read('fixtures/server/source-manifest.json');
  for (const source of manifest.sourceFiles) {
    const data = readFileSync(new URL(`../docs/李梓禾_知识点文档/详细版/${source.file}`, root));
    assert.equal(createHash('sha256').update(data).digest('hex'), source.sha256);
  }
  assert.equal(bank.filter((r) => r.grading.mode === 'CHOICE_SET').length, 5);
  assert.equal(bank.filter((r) => r.grading.mode === 'ALIASES_OR_REVIEW').length, 6);
  assert.equal(bank.filter((r) => r.grading.mode === 'REVIEW_REQUIRED').length, 13);
});

test('公开题目和练习响应没有服务端答案字段，原图引用存在', () => {
  const forbidden = new Set([
    'reference',
    'grading',
    'correctOptionIds',
    'acceptedValues',
    'answerText',
    'explanation',
  ]);
  const visit = (v) => {
    if (!v || typeof v !== 'object') return;
    for (const [k, value] of Object.entries(v)) {
      assert.ok(!forbidden.has(k), `泄露字段 ${k}`);
      visit(value);
    }
  };
  visit(questions);
  visit(practice);
  assert.deepEqual(
    bank.map((r) => r.question),
    questions,
  );
  for (const q of questions)
    for (const f of q.figures) assert.ok(existsSync(new URL(`public${f.src}`, root)));
});

function validateAnswer(q, a) {
  assert.equal(a.type, q.type);
  if (q.type === 'SINGLE_CHOICE') assert.ok(q.options.some((o) => o.id === a.selectedOptionId));
  else if (q.type === 'MULTIPLE_CHOICE') {
    assert.ok(a.selectedOptionIds.length > 0);
    assert.equal(new Set(a.selectedOptionIds).size, a.selectedOptionIds.length);
    for (const id of a.selectedOptionIds) assert.ok(q.options.some((o) => o.id === id));
  } else if (q.type === 'FILL_BLANK') {
    assert.deepEqual(a.blanks.map((b) => b.blankId).sort(), q.blanks.map((b) => b.id).sort());
    for (const b of q.blanks) {
      const values = a.blanks.find((v) => v.blankId === b.id).values;
      assert.equal(values.length, b.valueCount);
      assert.ok(values.every((v) => typeof v === 'string' && v.trim()));
    }
  } else if (q.type === 'JUDGMENT_REASON') {
    assert.deepEqual(
      a.judgments.map((j) => j.statementId),
      q.statements.map((s) => s.id),
    );
    assert.ok(a.judgments.every((j) => typeof j.value === 'boolean' && j.reason.trim()));
  } else {
    assert.deepEqual(
      a.parts.map((p) => p.partId),
      q.parts.map((p) => p.id),
    );
    assert.ok(a.parts.every((p) => p.text.trim()));
  }
}

test('全量请求逐题符合题型，结果与判定依据一致', () => {
  assert.equal(practice.totalCount, 24);
  assert.equal(submit.answers.length, 24);
  assert.equal(new Set(submit.answers.map((a) => a.practiceItemId)).size, 24);
  for (const [i, item] of practice.items.entries()) {
    assert.equal(item.position, i + 1);
    const request = submit.answers.find((a) => a.practiceItemId === item.id);
    validateAnswer(item.question, request.answer);
    const output = result.items.find((r) => r.practiceItemId === item.id);
    const record = bank.find((r) => r.question.id === item.question.id);
    assert.deepEqual(output.answer, request.answer);
    assert.deepEqual(output.question, item.question);
    assert.deepEqual(output.reference, record.reference);
    if (record.grading.mode === 'REVIEW_REQUIRED') {
      assert.deepEqual(output.evaluation, {
        status: 'PENDING_REVIEW',
        isCorrect: null,
        score: null,
      });
    } else {
      assert.equal(output.evaluation.status, 'CORRECT');
      if (record.grading.mode === 'CHOICE_SET') {
        const ids = request.answer.selectedOptionIds ?? [request.answer.selectedOptionId];
        assert.deepEqual([...ids].sort(), [...record.grading.correctOptionIds].sort());
      } else {
        for (const b of record.grading.blanks) {
          const values = request.answer.blanks.find((v) => v.blankId === b.blankId).values;
          assert.equal(values.length, b.acceptedValues.length);
          assert.ok(
            values.every((v, j) => b.acceptedValues[j].map(normalize).includes(normalize(v))),
          );
        }
      }
    }
  }
});

test('结果、历史、提交后练习状态一致，待复核不算错误或最终分数', () => {
  assert.equal(
    result.correctCount,
    result.items.filter((i) => i.evaluation.isCorrect === true).length,
  );
  assert.equal(
    result.pendingCount,
    result.items.filter((i) => i.evaluation.status === 'PENDING_REVIEW').length,
  );
  assert.equal(result.gradedCount + result.pendingCount, result.totalCount);
  assert.equal(result.score, null);
  assert.equal(result.gradingStatus, 'PENDING_REVIEW');
  const { items, ...summary } = result;
  assert.equal(items.length, result.totalCount);
  assert.deepEqual(read('fixtures/api/practice/history-response.json').data.items, [summary]);
  assert.equal(read('fixtures/api/practice/submitted-response.json').data.submissionId, result.id);
  assert.deepEqual(read('fixtures/api/practice/history-empty-response.json').data, {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
});

test('跨单元关联、拓展知识、分问结构及 11 入口完整', () => {
  const units = read('fixtures/content/knowledge-units.json');
  const knowledgeIds = new Set(units.flatMap((u) => u.knowledgeIds));
  assert.equal(knowledgeIds.size, 15);
  for (const q of questions) {
    assert.ok(q.knowledgeIds.every((id) => knowledgeIds.has(id)));
    for (const uid of q.unitIds)
      assert.ok(units.find((u) => u.id === uid).questionIds.includes(q.id));
  }
  assert.equal(questions.find((q) => q.id === 'Q06').blanks.length, 3);
  assert.equal(questions.find((q) => q.id === 'Q14').blanks[0].valueCount, 2);
  assert.equal(questions.find((q) => q.id === 'Q24').parts.length, 3);
  const scenarios = read('fixtures/api/scenarios.json');
  assert.equal(scenarios.length, 11);
  assert.equal(new Set(scenarios.map((s) => `${s.method} ${s.path}`)).size, 11);
  assert.ok(
    read('fixtures/api/errors.json').every(
      (s) => s.response.data === null && s.response.error.code,
    ),
  );
});

test('契约样例检查能发现错题型、重复选项、缺空和缺分问', () => {
  assert.throws(() =>
    validateAnswer(questions[0], { type: 'MULTIPLE_CHOICE', selectedOptionIds: ['C'] }),
  );
  assert.throws(() =>
    validateAnswer(questions[2], { type: 'MULTIPLE_CHOICE', selectedOptionIds: ['A', 'A'] }),
  );
  assert.throws(() => validateAnswer(questions[5], { type: 'FILL_BLANK', blanks: [] }));
  assert.throws(() =>
    validateAnswer(questions[23], {
      type: 'COMPREHENSIVE',
      parts: [{ partId: 'p1', text: '证明' }],
    }),
  );
});
