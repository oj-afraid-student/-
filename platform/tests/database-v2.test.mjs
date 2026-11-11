import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [initial, upgrade, bankJson, resultJson] = await Promise.all([
  read('db/migrations/001_initial.sql'),
  read('db/migrations/002_practice_v2.sql'),
  read('fixtures/server/question-bank.json'),
  read('fixtures/api/practice/result-response.json'),
]);

test('002 原地保留旧账号、练习、答案、题序和题目版本', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(initial);
  await db.exec(`
    INSERT INTO app_user (id, username, password_hash)
      VALUES ('00000000-0000-0000-0000-000000000001', 'old_user', 'test-hash');
    INSERT INTO knowledge_point (id, title, sort_order) VALUES ('SG-01', '空间位置关系', 1);
    INSERT INTO question_version
      (id, question_key, version, knowledge_point_id, stem, options, correct_option_id,
       explanation, is_published)
      VALUES ('00000000-0000-0000-0000-000000000002', 'Q01', 1, 'SG-01', '旧题干',
        '[{"id":"A","text":"一"},{"id":"B","text":"二"},{"id":"C","text":"三"},{"id":"D","text":"四"}]',
        'A', '{"steps":["第一步","第二步"]}', true);
    INSERT INTO practice (id, user_id, knowledge_point_id, status)
      VALUES ('00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000001', 'SG-01', 'SUBMITTED');
    INSERT INTO practice_item (id, practice_id, question_version_id, position)
      VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000002', 1);
    INSERT INTO submission (id, practice_id, correct_count)
      VALUES ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 0);
    INSERT INTO submission_answer (submission_id, practice_id, practice_item_id, selected_option_id, is_correct)
      VALUES ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004', 'B', false);
  `);
  await db.exec(upgrade);
  const { rows } = await db.query(`
    SELECT p.user_id, p.selection, p.status, i.position, i.question_version_id, s.id,
      s.total_count, s.graded_count, s.score, a.answer, a.evaluation_status,
      q.public_question, q.reference_answer
    FROM practice p JOIN submission s ON s.practice_id = p.id
    JOIN submission_answer a ON a.submission_id = s.id
    JOIN practice_item i ON i.id = a.practice_item_id
    JOIN question_version q ON q.id = i.question_version_id
  `);
  assert.equal(rows.length, 1);
  const old = rows[0];
  assert.equal(old.user_id, '00000000-0000-0000-0000-000000000001');
  assert.equal(old.question_version_id, '00000000-0000-0000-0000-000000000002');
  assert.equal(old.id, '00000000-0000-0000-0000-000000000005');
  assert.equal(old.status, 'SUBMITTED');
  assert.equal(old.position, 1);
  assert.equal(old.total_count, 5);
  assert.equal(old.graded_count, 5);
  assert.equal(old.score, 0);
  assert.deepEqual(old.selection, { mode: 'FILTERED', knowledgePointId: 'SG-01', count: 5 });
  assert.deepEqual(old.answer, { type: 'SINGLE_CHOICE', selectedOptionId: 'B' });
  assert.equal(old.evaluation_status, 'INCORRECT');
  assert.equal(old.public_question.stem, '旧题干');
  assert.equal(old.reference_answer.explanation, '第一步\n第二步');
});

test('002 支持 24 题与八题型往返，保留旧版本并约束提交归属和计数', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(initial);
  await db.exec(upgrade);
  const bank = JSON.parse(bankJson);
  const result = JSON.parse(resultJson).data;
  const { rows: users } = await db.query(
    "INSERT INTO app_user (username, password_hash) VALUES ('new_user', 'test-hash') RETURNING id",
  );
  const { rows: practices } = await db.query(
    'INSERT INTO practice (user_id, selection) VALUES ($1, $2) RETURNING id',
    [users[0].id, { mode: 'ALL' }],
  );
  const practiceId = practices[0].id;
  const { rows: submissions } = await db.query(
    `INSERT INTO submission (practice_id, total_count, graded_count, correct_count)
     VALUES ($1, $2, $3, $4) RETURNING id, pending_count, grading_status, score`,
    [practiceId, result.totalCount, result.gradedCount, result.correctCount],
  );
  const submission = submissions[0];
  assert.equal(submission.pending_count, 13);
  assert.equal(submission.grading_status, 'PENDING_REVIEW');
  assert.equal(submission.score, null);
  await assert.rejects(
    db.query(
      'INSERT INTO submission (practice_id, total_count, graded_count, correct_count) VALUES ($1, 24, 11, 11)',
      [practiceId],
    ),
    /unique constraint/,
  );

  for (const [index, entry] of bank.entries()) {
    const { question, reference, grading, source } = entry;
    const { rows: versions } = await db.query(
      `INSERT INTO question_version
        (question_key, version, public_question, reference_answer, grading, source)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [question.id, question.version, question, reference, grading, source],
    );
    const { rows: items } = await db.query(
      `INSERT INTO practice_item (practice_id, question_version_id, position)
        VALUES ($1, $2, $3) RETURNING id`,
      [practiceId, versions[0].id, index + 1],
    );
    const expected = result.items[index];
    await db.query(
      `INSERT INTO submission_answer (submission_id, practice_id, practice_item_id, answer, is_correct)
        VALUES ($1, $2, $3, $4, $5)`,
      [submission.id, practiceId, items[0].id, expected.answer, expected.evaluation.isCorrect],
    );
  }

  const { rows: saved } = await db.query(
    `SELECT q.public_question, q.reference_answer, q.is_published,
       i.id, a.answer, a.evaluation_status, a.is_correct, a.score
     FROM submission_answer a
     JOIN practice_item i ON i.id = a.practice_item_id
     JOIN question_version q ON q.id = i.question_version_id
     WHERE a.submission_id = $1 ORDER BY i.position`,
    [submission.id],
  );
  assert.equal(saved.length, 24);
  assert.equal(new Set(saved.map((row) => row.answer.type)).size, 8);
  assert.equal(
    saved.some((row) => row.is_published),
    false,
  );
  assert.deepEqual(
    saved.map((row) => [
      row.public_question,
      row.reference_answer,
      row.answer,
      row.evaluation_status,
      row.is_correct,
      row.score,
    ]),
    result.items.map((item) => [
      item.question,
      item.reference,
      item.answer,
      item.evaluation.status,
      item.evaluation.isCorrect,
      item.evaluation.score,
    ]),
  );
  await assert.rejects(
    db.query(
      "UPDATE question_version SET grading = grading || '{\"extra\":true}' WHERE question_key = 'Q14'",
    ),
    /immutable/,
  );
  const original = bank.find((entry) => entry.question.id === 'Q14');
  await db.query(
    `INSERT INTO question_version
      (question_key, version, public_question, reference_answer, grading, is_published)
      VALUES ('Q14', 2, $1, $2, $3, true)`,
    [
      { ...original.question, version: 2 },
      { ...original.reference, explanation: '新版解析' },
      original.grading,
    ],
  );
  const { rows: old } = await db.query(`
    SELECT q.version, q.reference_answer
    FROM practice_item i JOIN question_version q ON q.id = i.question_version_id
    WHERE q.question_key = 'Q14'
  `);
  assert.deepEqual(old, [{ version: 1, reference_answer: original.reference }]);
  const { rows: other } = await db.query(
    'INSERT INTO practice (user_id, selection) VALUES ($1, \'{"mode":"ALL"}\') RETURNING id',
    [users[0].id],
  );
  await assert.rejects(
    db.query(
      `INSERT INTO submission (practice_id, total_count, graded_count, correct_count)
        VALUES ($1, 2, 1, 2)`,
      [other[0].id],
    ),
    /check constraint/,
  );
  const { rows: otherResults } = await db.query(
    `INSERT INTO submission (practice_id, total_count, graded_count, correct_count)
      VALUES ($1, 1, 1, 1) RETURNING id`,
    [other[0].id],
  );
  await assert.rejects(
    db.query(
      `INSERT INTO submission_answer (submission_id, practice_id, practice_item_id, answer, is_correct)
        VALUES ($1, $2, $3, $4, true)`,
      [otherResults[0].id, other[0].id, saved[0].id, saved[0].answer],
    ),
    /foreign key constraint/,
  );
});
