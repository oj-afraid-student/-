import 'server-only';
import { withTransaction } from '@/server/db';
import { ApiError } from '@/server/http';
import { canPublishCandidate } from './publish';
import type { PublicQuestion } from '@/shared/contracts';
import type { QuestionVersionRecord } from '@/server/practice/contracts';
export async function loadQuestionForRevision(userId: string, id: string) {
  if (!canPublishCandidate(userId))
    throw new ApiError('VALIDATION_ERROR', 403, '只有题库复核员可以读取编辑内容与参考答案。');
  if (!/^Q\d{1,12}$/.test(id))
    throw new ApiError('VALIDATION_ERROR', 400, '请输入有效题号，如Q1003。');
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      version: number;
      question: PublicQuestion;
      reference: { answerText: string; answers?: string[]; explanation: string };
      grading: QuestionVersionRecord['grading'];
      published: boolean;
    }>(
      'SELECT version,public_question AS question,reference_answer AS reference,grading,is_published AS published FROM question_version WHERE question_key=$1 ORDER BY version DESC',
      [id],
    );
    const latest = rows.find((row) => row.published);
    if (!latest) throw new ApiError('NOT_FOUND', 404, '没有找到已发布题目。');
    const { question: q, reference, grading } = latest;
    let fields: string[], answers: string[];
    if ('options' in q) {
      fields = q.options.map((o) => o.text);
      answers =
        grading.mode === 'CHOICE_SET'
          ? grading.correctOptionIds.map((id) =>
              String.fromCharCode(65 + q.options.findIndex((o) => o.id === id)),
            )
          : [];
    } else if (q.type === 'FILL_BLANK') {
      if (
        q.blanks.some((b) => b.valueCount !== 1) ||
        grading.mode !== 'ALIASES_OR_REVIEW' ||
        grading.blanks.some(
          (b) => b.acceptedValues.length !== 1 || b.acceptedValues[0].length !== 1,
        )
      )
        throw new ApiError(
          'VALIDATION_ERROR',
          400,
          '该题包含多值或多种等价答案，当前简版编辑器不能无损编辑，请保留原题。',
        );
      fields = q.blanks.map((b) => b.label);
      answers = q.blanks.map(
        (b) => grading.blanks.find((g) => g.blankId === b.id)?.acceptedValues[0][0] ?? '',
      );
    } else {
      fields = ('parts' in q ? q.parts : q.statements).map((p) => p.prompt);
      answers =
        reference.answers ?? (fields.length === 1 ? [reference.answerText] : fields.map(() => ''));
    }
    return {
      title: q.title,
      stem: q.stem,
      fields,
      answers,
      explanation: reference.explanation,
      type: q.type,
      difficulty: q.difficulty,
      knowledgeIds: q.knowledgeIds,
      unitIds: q.unitIds,
      photo: q.figures[0]?.src.startsWith('data:image/jpeg;') ? q.figures[0].src : undefined,
      existingFigures: q.figures,
      origin: q.sourceLabel.includes('上传') ? 'UPLOAD' : 'AI_GENERATED',
      revision: { id, baseVersion: latest.version },
      history: rows.map((r) => ({
        version: r.version,
        title: r.question.title,
        published: r.published,
      })),
      status: 'PENDING_REVIEW',
      scopePreview: false,
    };
  });
}
