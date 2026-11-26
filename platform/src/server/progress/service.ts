import 'server-only';
import { withTransaction } from '@/server/db';
import { buildStudentProgress, type ProgressAttempt, type ProgressUnit } from './model';

export async function getStudentProgress(userId: string) {
  return withTransaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: units } = await client.query<ProgressUnit>(
      `SELECT id, title, content->'knowledgeIds' AS "knowledgeIds"
        FROM knowledge_point ORDER BY sort_order, id`,
    );
    const { rows: attempts } = await client.query<ProgressAttempt>(
      `SELECT s.id AS "submissionId", q.question_key AS "questionId",
        q.public_question->'knowledgeIds' AS "knowledgeIds", a.is_correct AS "isCorrect"
        FROM practice p
        JOIN submission s ON s.practice_id = p.id
        JOIN submission_answer a ON a.submission_id = s.id
        JOIN practice_item i ON i.id = a.practice_item_id
        JOIN question_version q ON q.id = i.question_version_id
        WHERE p.user_id = $1
        ORDER BY s.submitted_at DESC, s.id DESC, i.position`,
      [userId],
    );
    return buildStudentProgress(units, attempts);
  });
}
