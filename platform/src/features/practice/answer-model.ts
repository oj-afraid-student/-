import type {
  Answer,
  Practice,
  PublicQuestion,
  SubmitPracticeRequest,
} from '../../shared/contracts/index';

export type AnswerDraft =
  | Exclude<Answer, { type: 'JUDGMENT_REASON' }>
  | {
      type: 'JUDGMENT_REASON';
      judgments: { statementId: string; value: boolean | null; reason: string }[];
    };
export type Drafts = Record<string, AnswerDraft>;
export interface AnswerIssue {
  field: string;
  message: string;
}
export interface PracticeIssue extends AnswerIssue {
  itemId: string;
  position: number;
}

export function emptyAnswer(question: PublicQuestion): AnswerDraft {
  switch (question.type) {
    case 'SINGLE_CHOICE':
      return { type: question.type, selectedOptionId: '' };
    case 'MULTIPLE_CHOICE':
      return { type: question.type, selectedOptionIds: [] };
    case 'FILL_BLANK':
      return {
        type: question.type,
        blanks: question.blanks.map((blank) => ({
          blankId: blank.id,
          values: Array.from({ length: blank.valueCount }, () => ''),
        })),
      };
    case 'JUDGMENT_REASON':
      return {
        type: question.type,
        judgments: question.statements.map((statement) => ({
          statementId: statement.id,
          value: null,
          reason: '',
        })),
      };
    default:
      return {
        type: question.type,
        parts: question.parts.map((part) => ({ partId: part.id, text: '' })),
      };
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Browser storage is untrusted. Rebuild only the current schema's fields and IDs. */
export function restoreAnswer(question: PublicQuestion, value: unknown): AnswerDraft {
  const draft = emptyAnswer(question);
  if (!record(value) || value.type !== question.type) return draft;
  if (
    draft.type === 'SINGLE_CHOICE' &&
    'options' in question &&
    typeof value.selectedOptionId === 'string'
  ) {
    draft.selectedOptionId = question.options.some((option) => option.id === value.selectedOptionId)
      ? value.selectedOptionId
      : '';
  } else if (
    draft.type === 'MULTIPLE_CHOICE' &&
    'options' in question &&
    Array.isArray(value.selectedOptionIds)
  ) {
    draft.selectedOptionIds = question.options
      .filter((option) => (value.selectedOptionIds as unknown[]).includes(option.id))
      .map((option) => option.id);
  } else if (draft.type === 'FILL_BLANK' && Array.isArray(value.blanks)) {
    for (const blank of draft.blanks) {
      const saved = value.blanks.find((entry) => record(entry) && entry.blankId === blank.blankId);
      if (record(saved) && Array.isArray(saved.values))
        blank.values = blank.values.map((_, i) =>
          typeof saved.values === 'object' &&
          Array.isArray(saved.values) &&
          typeof saved.values[i] === 'string'
            ? saved.values[i]
            : '',
        );
    }
  } else if (draft.type === 'JUDGMENT_REASON' && Array.isArray(value.judgments)) {
    for (const judgment of draft.judgments) {
      const saved = value.judgments.find(
        (entry) => record(entry) && entry.statementId === judgment.statementId,
      );
      if (record(saved)) {
        judgment.value = typeof saved.value === 'boolean' ? saved.value : null;
        judgment.reason = typeof saved.reason === 'string' ? saved.reason : '';
      }
    }
  } else if ('parts' in draft && Array.isArray(value.parts)) {
    for (const part of draft.parts) {
      const saved = value.parts.find((entry) => record(entry) && entry.partId === part.partId);
      if (record(saved) && typeof saved.text === 'string') part.text = saved.text;
    }
  }
  return draft;
}

function sameIds(actual: string[], expected: string[]) {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((id) => actual.includes(id))
  );
}
export function validateAnswer(
  question: PublicQuestion,
  draft: AnswerDraft | undefined,
): AnswerIssue[] {
  if (!draft || draft.type !== question.type) return [{ field: '', message: '请完成本题。' }];
  const issues: AnswerIssue[] = [];
  function text(value: string, field: string, max: number, label: string) {
    if (!value.trim()) issues.push({ field, message: `请填写${label}。` });
    else if (value.trim().length > max)
      issues.push({ field, message: `${label}不能超过 ${max} 个字符。` });
  }
  if (draft.type === 'SINGLE_CHOICE' && 'options' in question) {
    if (!question.options.some((option) => option.id === draft.selectedOptionId))
      issues.push({ field: 'choice', message: '请选择一个选项。' });
  } else if (draft.type === 'MULTIPLE_CHOICE' && 'options' in question) {
    if (
      !draft.selectedOptionIds.length ||
      new Set(draft.selectedOptionIds).size !== draft.selectedOptionIds.length ||
      draft.selectedOptionIds.some((id) => !question.options.some((option) => option.id === id))
    )
      issues.push({ field: 'choice', message: '请选择有效选项，且不要重复。' });
  } else if (draft.type === 'FILL_BLANK' && question.type === 'FILL_BLANK') {
    if (
      !sameIds(
        draft.blanks.map((blank) => blank.blankId),
        question.blanks.map((blank) => blank.id),
      )
    )
      return [{ field: '', message: '填空结构不完整，请重新填写本题。' }];
    for (const blank of question.blanks) {
      const answer = draft.blanks.find((entry) => entry.blankId === blank.id)!;
      if (answer.values.length !== blank.valueCount)
        issues.push({ field: blank.id, message: `${blank.label}需要 ${blank.valueCount} 个值。` });
      answer.values.forEach((value, index) =>
        text(
          value,
          `${blank.id}-${index}`,
          200,
          `${blank.label}${blank.valueCount > 1 ? `的第 ${index + 1} 个值` : ''}`,
        ),
      );
    }
  } else if (draft.type === 'JUDGMENT_REASON' && question.type === 'JUDGMENT_REASON') {
    if (
      !sameIds(
        draft.judgments.map((entry) => entry.statementId),
        question.statements.map((entry) => entry.id),
      )
    )
      return [{ field: '', message: '判断结构不完整，请重新填写本题。' }];
    for (const entry of draft.judgments) {
      if (typeof entry.value !== 'boolean')
        issues.push({ field: `${entry.statementId}-value`, message: '请选择正确或错误。' });
      text(entry.reason, `${entry.statementId}-reason`, 10000, '判断理由');
    }
  } else if ('parts' in draft && 'parts' in question) {
    if (
      !sameIds(
        draft.parts.map((part) => part.partId),
        question.parts.map((part) => part.id),
      )
    )
      return [{ field: '', message: '分问结构不完整，请重新填写本题。' }];
    for (const part of draft.parts) text(part.text, part.partId, 10000, '本问的推理或计算过程');
  } else issues.push({ field: '', message: '作答类型不匹配，请重新填写。' });
  return issues;
}

export function serializeAnswer(question: PublicQuestion, draft: AnswerDraft): Answer {
  if (validateAnswer(question, draft).length) throw new Error('答案尚未完整。');
  switch (draft.type) {
    case 'SINGLE_CHOICE':
      return { type: draft.type, selectedOptionId: draft.selectedOptionId };
    case 'MULTIPLE_CHOICE':
      return { type: draft.type, selectedOptionIds: [...draft.selectedOptionIds].sort() };
    case 'FILL_BLANK':
      return {
        type: draft.type,
        blanks: draft.blanks.map((blank) => ({
          blankId: blank.blankId,
          values: blank.values.map((value) => value.trim()),
        })),
      };
    case 'JUDGMENT_REASON':
      return {
        type: draft.type,
        judgments: draft.judgments.map((judgment) => ({
          statementId: judgment.statementId,
          value: judgment.value as boolean,
          reason: judgment.reason.trim(),
        })),
      };
    default:
      return {
        type: draft.type,
        parts: draft.parts.map((part) => ({ partId: part.partId, text: part.text.trim() })),
      };
  }
}

export function prepareSubmission(
  practice: Practice,
  drafts: Drafts,
): { payload: SubmitPracticeRequest | null; issues: PracticeIssue[] } {
  const issues = practice.items.flatMap((item) =>
    validateAnswer(item.question, drafts[item.id]).map((issue) => ({
      ...issue,
      itemId: item.id,
      position: item.position,
    })),
  );
  if (issues.length) return { payload: null, issues };
  const payload = {
    answers: practice.items.map((item) => ({
      practiceItemId: item.id,
      answer: serializeAnswer(item.question, drafts[item.id]),
    })),
  };
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 1024 * 1024)
    return {
      payload: null,
      issues: [
        {
          field: '',
          message: '本次作答超过 1 MiB，请精简过程后再提交。',
          itemId: practice.items[0]?.id ?? '',
          position: 1,
        },
      ],
    };
  return { payload, issues: [] };
}
