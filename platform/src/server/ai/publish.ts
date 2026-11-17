import 'server-only';
import { createHash } from 'node:crypto';
import type { Difficulty, PublicQuestion } from '@/shared/contracts';
import { withTransaction } from '@/server/db';
import { ApiError } from '@/server/http';
import { invalid, keys } from '@/server/practice/rules';
import type { QuestionVersionRecord } from '@/server/practice/contracts';
import { validateCandidate } from './learning';

export function canPublishCandidate(userId: string) {
  return (process.env.ZHIXU_QUESTION_REVIEWER_IDS ?? '')
    .split(',')
    .some((id) => id.trim() === userId);
}

export async function publishCandidate(userId: string, input: unknown) {
  if (!canPublishCandidate(userId))
    throw new ApiError('VALIDATION_ERROR', 403, '只有题库复核员可以发布。');
  keys(input, [
    'requestId',
    'confirmed',
    'knowledgeId',
    'type',
    'difficulty',
    'title',
    'stem',
    'fields',
    'answers',
    'explanation',
  ]);
  const { requestId, knowledgeId, type, difficulty } = input;
  if (
    input.confirmed !== true ||
    typeof requestId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(requestId) ||
    typeof knowledgeId !== 'string' ||
    typeof type !== 'string' ||
    typeof difficulty !== 'string'
  )
    return invalid('请核对并确认题目、答案与解析后再发布。');

  const candidate = validateCandidate(input, type, difficulty, () =>
    invalid('题型、答案序号或题目字段不符合要求。'),
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ knowledgeId, candidate }))
    .digest('hex');
  return withTransaction(async (client) => {
    await client.query('LOCK TABLE knowledge_point, question_version IN SHARE ROW EXCLUSIVE MODE');
    const { rows: prior } = await client.query<{ id: string; fingerprint: string }>(
      "SELECT question_key AS id, source->>'fingerprint' AS fingerprint FROM question_version WHERE source->>'reviewerId' = $1 AND source->>'requestId' = $2",
      [userId, requestId],
    );
    if (prior[0]) {
      if (prior[0].fingerprint !== fingerprint)
        throw new ApiError('CONFLICT', 409, '该发布请求已处理，编辑后请重新确认。');
      return { id: prior[0].id };
    }
    const { rows: units } = await client.query<{ id: string }>(
      "SELECT id FROM knowledge_point WHERE content ? 'sections' AND (content->'knowledgeIds') ? $1",
      [knowledgeId],
    );
    if (units.length !== 1)
      return invalid('这个知识点尚未正式入库或关联有误，请选择已发布目录中的知识点。');
    const { rows } = await client.query<{ id: string }>(
      "SELECT 'Q' || (greatest(999, coalesce(max(substring(question_key from 2)::bigint), 0)) + 1) AS id FROM question_version WHERE question_key ~ '^Q[0-9]{1,12}$'",
    );
    const id = rows[0].id;
    const base = {
      id,
      version: 1,
      title: candidate.title.trim(),
      stem: candidate.stem.trim(),
      difficulty: difficulty as Difficulty,
      knowledgeIds: [knowledgeId],
      unitIds: [units[0].id],
      figures: [],
      sourceLabel: 'AI 生成 · 人工复核',
    };
    const fields = candidate.fields.map((item) => item.trim());
    const answers = candidate.answers.map((item) => item.trim());
    let question: PublicQuestion;
    let grading: QuestionVersionRecord['grading'];
    let answerText = answers.join('；');
    if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
      const options = fields.map((text, index) => ({ id: String.fromCharCode(65 + index), text }));
      const correctOptionIds = answers.map((answer) => options[Number(answer) - 1].id);
      question = { ...base, type, options };
      grading = { mode: 'CHOICE_SET', correctOptionIds };
      answerText = correctOptionIds.join('、');
    } else if (type === 'FILL_BLANK') {
      const blanks = fields.map((label, index) => ({
        id: 'b' + (index + 1),
        label,
        valueCount: 1,
        unordered: false,
        unit: null,
      }));
      question = { ...base, type, blanks };
      grading = {
        mode: 'ALIASES_OR_REVIEW',
        blanks: blanks.map((blank, index) => ({
          blankId: blank.id,
          acceptedValues: [[answers[index]]],
        })),
      };
    } else {
      const parts = fields.map((prompt, index) => ({ id: 'p' + (index + 1), prompt }));
      if (type === 'JUDGMENT_REASON') question = { ...base, type, statements: parts };
      else if (
        type === 'PROOF' ||
        type === 'PROOF_CALCULATION' ||
        type === 'EXPLORATION_PROOF' ||
        type === 'COMPREHENSIVE'
      )
        question = { ...base, type, parts };
      else return invalid();
      grading = { mode: 'REVIEW_REQUIRED' };
    }
    await client.query(
      'INSERT INTO question_version (question_key, version, public_question, reference_answer, grading, source, is_published) VALUES ($1, 1, $2, $3, $4, $5, true)',
      [
        id,
        question,
        { answerText, explanation: candidate.explanation.trim() },
        grading,
        {
          document: 'AI 候选题在线复核',
          questionId: id,
          note: '人工复核发布',
          reviewerId: userId,
          requestId,
          fingerprint,
        },
      ],
    );
    return { id };
  });
}
