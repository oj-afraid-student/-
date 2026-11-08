import 'server-only';
import type { PoolClient } from 'pg';
import type {
  Answer,
  HistoryPage,
  Practice,
  ResultItem,
  SubmissionDetail,
  SubmissionSummary,
  SubmitPracticeResult,
} from '@/shared/contracts';
import { withTransaction } from '@/server/db';
import { ApiError } from '@/server/http';
import { practiceCatalog, publicQuestion } from './catalog';
import {
  canonical,
  evaluate,
  invalid,
  keys,
  missing,
  readAnswer,
  sameIds,
  selection,
} from './rules';

function resourceId(id: string) {
  // Invalid opaque IDs have the same response as inaccessible resources, not SQL cast errors.
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) missing();
}
const iso = (value: Date | string) => new Date(value).toISOString();
const summaryColumns = `s.id, s.practice_id AS "practiceId", s.submitted_at AS "submittedAt",
  s.total_count AS "totalCount", s.graded_count AS "gradedCount", s.pending_count AS "pendingCount",
  s.correct_count AS "correctCount", s.grading_status AS "gradingStatus", s.score,
  s.total_count AS "maxScore"`;
function summary(row: SubmissionSummary): SubmissionSummary {
  return { ...row, submittedAt: iso(row.submittedAt) };
}

async function ownedPractice(client: PoolClient, userId: string, id: string, lock = false) {
  resourceId(id);
  const { rows } = await client.query<Practice>(
    `SELECT p.id, p.status, p.created_at AS "createdAt", p.selection,
      s.id AS "submissionId" FROM practice p LEFT JOIN submission s ON s.practice_id = p.id
      WHERE p.id = $1 AND p.user_id = $2 ${lock ? 'FOR UPDATE OF p' : ''}`,
    [id, userId],
  );
  if (!rows.length) missing();
  const { rows: items } = await client.query<{ id: string; position: number; versionId: string }>(
    `SELECT id, position, question_version_id AS "versionId" FROM practice_item
      WHERE practice_id = $1 ORDER BY position`,
    [id],
  );
  const versions = await practiceCatalog(client).loadQuestionVersions(
    items.map((item) => item.versionId),
  );
  const practice: Practice = {
    ...rows[0],
    createdAt: iso(rows[0].createdAt),
    totalCount: items.length,
    items: items.map((item, index) => ({
      id: item.id,
      position: item.position,
      question: publicQuestion(versions[index].question),
    })),
  };
  return { practice, versions };
}

export async function createPractice(userId: string, value: unknown): Promise<Practice> {
  return withTransaction(async (client) => {
    const catalog = practiceCatalog(client);
    const bank = await catalog.listPublished();
    const chosen = selection(value, bank);
    const { rows } = await client.query<{ id: string }>(
      'INSERT INTO practice (user_id, selection) VALUES ($1, $2) RETURNING id',
      [userId, chosen.selection],
    );
    for (const [index, record] of chosen.versions.entries()) {
      const stored = bank.find((entry) => entry.question.id === record.question.id)!;
      await client.query(
        'INSERT INTO practice_item (practice_id, question_version_id, position) VALUES ($1, $2, $3)',
        [rows[0].id, stored.versionId, index + 1],
      );
    }
    return (await ownedPractice(client, userId, rows[0].id)).practice;
  });
}

export async function getPractice(userId: string, id: string): Promise<Practice> {
  return withTransaction(async (client) => {
    // Keep status/submission ID and items on one committed snapshot.
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return (await ownedPractice(client, userId, id)).practice;
  });
}

export async function submitPractice(
  userId: string,
  id: string,
  value: unknown,
): Promise<{
  data: SubmitPracticeResult;
  created: boolean;
}> {
  return withTransaction(async (client) => {
    const { practice, versions } = await ownedPractice(client, userId, id, true);
    keys(value, ['answers']);
    if (!Array.isArray(value.answers)) invalid();
    const raw = value.answers as unknown[];
    raw.forEach((entry) => keys(entry, ['practiceItemId', 'answer']));
    const entries = raw as { practiceItemId: string; answer: unknown }[];
    if (
      !sameIds(
        entries.map((entry) => entry.practiceItemId),
        practice.items.map((item) => item.id),
      )
    )
      invalid('提交必须完整覆盖本次练习的每一道题。');
    const answers = practice.items.map((item, index) =>
      readAnswer(
        versions[index],
        entries.find((entry) => entry.practiceItemId === item.id)!.answer,
      ),
    );
    // A separate query after acquiring the lock sees a concurrent winner's committed submission.
    const { rows: existing } = await client.query<SubmissionSummary>(
      `SELECT ${summaryColumns} FROM submission s WHERE s.practice_id = $1`,
      [id],
    );
    if (existing.length) {
      const { rows: saved } = await client.query<{ practiceItemId: string; answer: Answer }>(
        'SELECT practice_item_id AS "practiceItemId", answer FROM submission_answer WHERE submission_id = $1',
        [existing[0].id],
      );
      const identical =
        saved.length === answers.length &&
        practice.items.every((item, index) => {
          const prior = saved.find((entry) => entry.practiceItemId === item.id);
          return (
            prior &&
            JSON.stringify(canonical(versions[index], prior.answer)) ===
              JSON.stringify(canonical(versions[index], answers[index]))
          );
        });
      if (!identical) throw new ApiError('CONFLICT', 409, '本次练习已提交，修改答案请创建新练习。');
      return {
        created: false,
        data: {
          submissionId: existing[0].id,
          practiceId: id,
          gradingStatus: existing[0].gradingStatus,
        },
      };
    }
    const evaluations = answers.map((answer, index) => evaluate(versions[index], answer));
    const { rows: saved } = await client.query<SubmissionSummary>(
      `INSERT INTO submission (practice_id, total_count, graded_count, correct_count)
        VALUES ($1, $2, $3, $4) RETURNING id, grading_status AS "gradingStatus"`,
      [
        id,
        answers.length,
        evaluations.filter((e) => e.status !== 'PENDING_REVIEW').length,
        evaluations.filter((e) => e.status === 'CORRECT').length,
      ],
    );
    for (const [index, answer] of answers.entries()) {
      await client.query(
        `INSERT INTO submission_answer (submission_id, practice_id, practice_item_id, answer, is_correct)
          VALUES ($1, $2, $3, $4, $5)`,
        [saved[0].id, id, practice.items[index].id, answer, evaluations[index].isCorrect],
      );
    }
    await client.query("UPDATE practice SET status = 'SUBMITTED' WHERE id = $1", [id]);
    return {
      created: true,
      data: { submissionId: saved[0].id, practiceId: id, gradingStatus: saved[0].gradingStatus },
    };
  });
}

export async function getSubmission(userId: string, id: string): Promise<SubmissionDetail> {
  resourceId(id);
  return withTransaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows } = await client.query<SubmissionSummary>(
      `SELECT ${summaryColumns} FROM submission s JOIN practice p ON p.id = s.practice_id
        WHERE s.id = $1 AND p.user_id = $2`,
      [id, userId],
    );
    if (!rows.length) missing();
    const { practice, versions } = await ownedPractice(client, userId, rows[0].practiceId);
    const { rows: saved } = await client.query<{
      practiceItemId: string;
      answer: Answer;
      isCorrect: boolean | null;
    }>(
      `SELECT practice_item_id AS "practiceItemId", answer, is_correct AS "isCorrect"
        FROM submission_answer WHERE submission_id = $1`,
      [id],
    );
    const items: ResultItem[] = practice.items.map((item, index) => {
      const answer = saved.find((entry) => entry.practiceItemId === item.id);
      if (!answer) throw new Error('Stored submission is incomplete');
      return {
        practiceItemId: item.id,
        question: item.question,
        answer: answer.answer,
        reference: {
          answerText: versions[index].reference.answerText,
          explanation: versions[index].reference.explanation,
        },
        evaluation:
          answer.isCorrect === null
            ? { status: 'PENDING_REVIEW', isCorrect: null, score: null }
            : answer.isCorrect
              ? { status: 'CORRECT', isCorrect: true, score: 1 }
              : { status: 'INCORRECT', isCorrect: false, score: 0 },
      };
    });
    return { ...summary(rows[0]), items };
  });
}

export function historyQuery(params: URLSearchParams): { page: number; pageSize: number } {
  if (
    [...params.keys()].some((key) => !['page', 'pageSize'].includes(key)) ||
    ['page', 'pageSize'].some((key) => params.getAll(key).length > 1)
  )
    invalid();
  const parse = (key: string, fallback: string) => {
    const text = params.get(key) ?? fallback;
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(+text) || +text < 1)
      invalid('分页参数应为正整数。');
    return +text;
  };
  const page = parse('page', '1'),
    pageSize = parse('pageSize', '20');
  if (pageSize > 100) invalid('每页最多 100 条。');
  return { page, pageSize };
}
export async function listSubmissions(
  userId: string,
  params: URLSearchParams,
): Promise<HistoryPage> {
  const { page, pageSize } = historyQuery(params);
  return withTransaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: counts } = await client.query<{ total: string }>(
      'SELECT count(*) AS total FROM submission s JOIN practice p ON p.id = s.practice_id WHERE p.user_id = $1',
      [userId],
    );
    const total = Number(counts[0].total);
    // Avoid overflowing PostgreSQL bigint for valid but far out-of-range pages.
    if (page > Math.ceil(total / pageSize)) return { items: [], total, page, pageSize };
    const { rows } = await client.query<SubmissionSummary>(
      `SELECT ${summaryColumns} FROM submission s JOIN practice p ON p.id = s.practice_id
        WHERE p.user_id = $1 ORDER BY s.submitted_at DESC, s.id DESC LIMIT $2 OFFSET $3`,
      [userId, pageSize, (page - 1) * pageSize],
    );
    return { items: rows.map(summary), total, page, pageSize };
  });
}
