import 'server-only';
import { createHash } from 'node:crypto';
import type { Difficulty, PublicQuestion } from '@/shared/contracts';
import { withTransaction } from '@/server/db';
import { ApiError } from '@/server/http';
import { invalid, keys } from '@/server/practice/rules';
import type { QuestionVersionRecord } from '@/server/practice/contracts';
import { validateCandidate } from './learning';
import { photoSchema } from '@/shared/study-contract';

export function canPublishCandidate(userId: string) {
  return (process.env.ZHIXU_QUESTION_REVIEWER_IDS ?? '')
    .split(',')
    .some((id) => id.trim() === userId);
}

export async function publishCandidate(userId: string, input: unknown) {
  if (!canPublishCandidate(userId))
    throw new ApiError('VALIDATION_ERROR', 403, '只有题库复核员可以发布。');
  keys(
    input,
    [
      'requestId',
      'confirmed',
      'type',
      'difficulty',
      'title',
      'stem',
      'fields',
      'answers',
      'explanation',
    ],
    ['knowledgeId', 'knowledgeIds', 'photo', 'origin', 'revision'],
  );
  let revision: { id: string; baseVersion: number } | undefined;
  if (input.revision !== undefined) {
    keys(input.revision, ['id', 'baseVersion']);
    const { id, baseVersion } = input.revision;
    if (
      typeof id !== 'string' ||
      !/^Q\d{1,12}$/.test(id) ||
      typeof baseVersion !== 'number' ||
      !Number.isSafeInteger(baseVersion) ||
      baseVersion < 1
    )
      return invalid('修订题号或原版本无效。');
    revision = { id, baseVersion };
  }
  if (
    input.origin !== undefined &&
    (typeof input.origin !== 'string' || !['UPLOAD', 'AI_GENERATED'].includes(input.origin))
  )
    return invalid('题目来源无效。');
  if (input.photo !== undefined && !photoSchema.safeParse(input.photo).success)
    return invalid('题图格式不正确。');
  const { requestId, type, difficulty } = input;
  const knowledgeIds = input.knowledgeIds ?? [input.knowledgeId];
  if (
    !Array.isArray(knowledgeIds) ||
    !knowledgeIds.length ||
    knowledgeIds.length > 6 ||
    new Set(knowledgeIds).size !== knowledgeIds.length ||
    knowledgeIds.some((id) => typeof id !== 'string')
  )
    return invalid('请选择 1—6 个不重复的正式知识点。');
  if (
    input.confirmed !== true ||
    typeof requestId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(requestId) ||
    typeof type !== 'string' ||
    typeof difficulty !== 'string'
  )
    return invalid('请核对并确认题目、答案与解析后再发布。');

  const candidate = validateCandidate(input, type, difficulty, () =>
    invalid('题型、答案序号或题目字段不符合要求。'),
  );
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        knowledgeIds: [...knowledgeIds].sort(),
        candidate,
        photo: input.photo,
        ...(input.origin ? { origin: input.origin } : {}),
        ...(revision ? { revision } : {}),
      }),
    )
    .digest('hex');
  return withTransaction(async (client) => {
    await client.query('LOCK TABLE knowledge_point, question_version IN SHARE ROW EXCLUSIVE MODE');
    const { rows: prior } = await client.query<{
      id: string;
      version: number;
      fingerprint: string;
    }>(
      "SELECT question_key AS id, version, source->>'fingerprint' AS fingerprint FROM question_version WHERE source->>'reviewerId' = $1 AND source->>'requestId' = $2",
      [userId, requestId],
    );
    if (prior[0]) {
      if (prior[0].fingerprint !== fingerprint)
        throw new ApiError('CONFLICT', 409, '该发布请求已处理，编辑后请重新确认。');
      return revision ? { id: prior[0].id, version: prior[0].version } : { id: prior[0].id };
    }
    let previous:
      | {
          version: number;
          question: PublicQuestion;
          source: Record<string, unknown>;
          published: boolean;
        }
      | undefined;
    let nextVersion = 1;
    if (revision) {
      const { rows: versions } = await client.query<{
        version: number;
        question: PublicQuestion;
        source: Record<string, unknown>;
        published: boolean;
      }>(
        'SELECT version, public_question AS question, source, is_published AS published FROM question_version WHERE question_key=$1 ORDER BY version DESC',
        [revision.id],
      );
      previous = versions.find((v) => v.published);
      if (!previous) throw new ApiError('NOT_FOUND', 404, '没有找到已发布题目。');
      if (previous.version !== revision.baseVersion)
        throw new ApiError(
          'CONFLICT',
          409,
          '该题已有更新版本，请重新读取后合并修改，避免覆盖他人更改。',
        );
      nextVersion = versions[0].version + 1;
    }
    const { rows: units } = await client.query<{ id: string; tags: string[] }>(
      "SELECT id, content->'knowledgeIds' AS tags FROM knowledge_point WHERE content ? 'sections' AND (content->'knowledgeIds') ?| $1::text[]",
      [knowledgeIds],
    );
    if (knowledgeIds.some((id) => units.filter((unit) => unit.tags.includes(id)).length !== 1))
      return invalid('这个知识点尚未正式入库或关联有误，请选择已发布目录中的知识点。');
    const { rows } = await client.query<{ id: string }>(
      "SELECT 'Q' || (greatest(999, coalesce(max(substring(question_key from 2)::bigint), 0)) + 1) AS id FROM question_version WHERE question_key ~ '^Q[0-9]{1,12}$'",
    );
    const id = revision?.id ?? rows[0].id;
    const base = {
      id,
      version: nextVersion,
      title: candidate.title.trim(),
      stem: candidate.stem.trim(),
      difficulty: difficulty as Difficulty,
      knowledgeIds,
      unitIds: units.map((unit) => unit.id),
      figures: previous
        ? typeof input.photo === 'string'
          ? previous.question.figures.length
            ? previous.question.figures.map((figure, index) =>
                index === 0 ? { ...figure, src: input.photo as string } : figure,
              )
            : [
                {
                  id: id + '-upload',
                  src: input.photo,
                  alt: '人工复核的题图',
                  caption: '修订时确认的题图',
                },
              ]
          : previous.question.figures
        : typeof input.photo === 'string'
          ? [
              {
                id: id + '-upload',
                src: input.photo,
                alt: '人工复核的上传题图',
                caption: '发布时保留的原题图',
              },
            ]
          : [],
      sourceLabel:
        previous?.question.sourceLabel ??
        (input.origin === 'UPLOAD' ? '上传题目 · 人工复核' : 'AI 生成 · 人工复核'),
    };
    const fields = candidate.fields.map((item) => item.trim());
    const answers = candidate.answers.map((item) => item.trim());
    let question: PublicQuestion;
    let grading: QuestionVersionRecord['grading'];
    let answerText = answers.join('；');
    if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
      const options = fields.map((text, index) => ({ id: String.fromCharCode(65 + index), text }));
      const correctOptionIds = answers;
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
      'INSERT INTO question_version (question_key, version, public_question, reference_answer, grading, source, is_published) VALUES ($1, $2, $3, $4, $5, $6, true)',
      [
        id,
        nextVersion,
        question,
        { answerText, answers, explanation: candidate.explanation.trim() },
        grading,
        {
          ...(previous?.source ?? {}),
          ...(revision ? { previousVersion: revision.baseVersion, revision: true } : {}),
          document:
            previous?.source.document ??
            (input.origin === 'UPLOAD' ? '上传题目在线复核' : 'AI 候选题在线复核'),
          questionId: id,
          note: '人工复核发布',
          reviewerId: userId,
          requestId,
          fingerprint,
        },
      ],
    );
    return revision ? { id, version: nextVersion } : { id };
  });
}
