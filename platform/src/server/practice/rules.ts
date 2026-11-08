import 'server-only';
import type { Answer, CreatePracticeRequest, Evaluation } from '@/shared/contracts';
import type { QuestionVersionRecord } from './contracts';
import { ApiError } from '@/server/http';
import { restoreAnswer, serializeAnswer, validateAnswer } from '@/features/practice/answer-model';

export const invalid = (message = '请求字段不符合契约。'): never => {
  throw new ApiError('VALIDATION_ERROR', 400, message);
};
export const missing = (): never => {
  throw new ApiError('NOT_FOUND', 404, '没有找到可访问的资源。');
};
const normalize = (value: string) =>
  value.normalize('NFKC').replace(/\s/g, '').replaceAll('／', '/');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function keys(
  value: unknown,
  required: string[],
  optional: string[] = [],
): asserts value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => ![...required, ...optional].includes(key))
  )
    invalid();
}
export function sameIds(actual: unknown[], expected: string[]) {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((id) => typeof id === 'string' && expected.includes(id))
  );
}
export function selection(
  value: unknown,
  bank: QuestionVersionRecord[],
): {
  selection: CreatePracticeRequest;
  versions: QuestionVersionRecord[];
} {
  keys(
    value,
    ['mode'],
    ['knowledgePointId', 'difficulty', 'questionTypes', 'count', 'questionIds'],
  );
  let versions = [...bank];
  if (value.mode === 'ALL') keys(value, ['mode']);
  else if (value.mode === 'EXPLICIT') {
    keys(value, ['mode', 'questionIds']);
    if (
      !Array.isArray(value.questionIds) ||
      !value.questionIds.length ||
      value.questionIds.length > 100 ||
      new Set(value.questionIds).size !== value.questionIds.length ||
      value.questionIds.some((id) => typeof id !== 'string')
    )
      invalid('题号应为 1—100 个不重复字符串。');
    versions = (value.questionIds as string[]).map(
      (id) => bank.find((record) => record.question.id === id) ?? missing(),
    );
  } else if (value.mode === 'FILTERED') {
    keys(value, ['mode'], ['knowledgePointId', 'difficulty', 'questionTypes', 'count']);
    if (value.knowledgePointId !== undefined) {
      if (typeof value.knowledgePointId !== 'string') invalid();
      versions = versions.filter((record) =>
        record.question.unitIds.includes(value.knowledgePointId as string),
      );
    }
    if (value.difficulty !== undefined) {
      if (
        typeof value.difficulty !== 'string' ||
        !['BASIC', 'INTERMEDIATE', 'COMPREHENSIVE'].includes(value.difficulty)
      )
        invalid();
      versions = versions.filter((record) => record.question.difficulty === value.difficulty);
    }
    if (value.questionTypes !== undefined) {
      const allowed = new Set([
        'SINGLE_CHOICE',
        'MULTIPLE_CHOICE',
        'FILL_BLANK',
        'JUDGMENT_REASON',
        'PROOF',
        'PROOF_CALCULATION',
        'EXPLORATION_PROOF',
        'COMPREHENSIVE',
      ]);
      if (
        !Array.isArray(value.questionTypes) ||
        !value.questionTypes.length ||
        new Set(value.questionTypes).size !== value.questionTypes.length ||
        value.questionTypes.some((type) => !allowed.has(type))
      )
        invalid();
      versions = versions.filter((record) =>
        (value.questionTypes as string[]).includes(record.question.type),
      );
    }
    if (value.count !== undefined) {
      if (
        !Number.isInteger(value.count) ||
        (value.count as number) < 1 ||
        (value.count as number) > 100
      )
        invalid('题量应为 1—100 的整数。');
      if (!versions.length) missing();
      if (versions.length < (value.count as number))
        throw new ApiError('CONFLICT', 409, `匹配的题目只有 ${versions.length} 道，请减少题量。`);
      versions = versions.slice(0, value.count as number);
    }
  } else invalid('请选择 ALL、FILTERED 或 EXPLICIT。');
  if (!versions.length) missing();
  if (versions.length > 100) invalid('题目超过 100 道，请缩小范围。');
  return {
    selection: value as unknown as CreatePracticeRequest,
    versions: structuredClone(versions),
  };
}

export function readAnswer(record: QuestionVersionRecord, value: unknown): Answer {
  const q = record.question;
  const fields: Record<string, string[]> = {
    SINGLE_CHOICE: ['selectedOptionId'],
    MULTIPLE_CHOICE: ['selectedOptionIds'],
    FILL_BLANK: ['blanks'],
    JUDGMENT_REASON: ['judgments'],
  };
  keys(value, ['type', ...(fields[q.type] ?? ['parts'])]);
  if (value.type !== q.type) invalid('作答题型不匹配。');
  if (q.type === 'MULTIPLE_CHOICE') {
    if (
      !Array.isArray(value.selectedOptionIds) ||
      !value.selectedOptionIds.length ||
      new Set(value.selectedOptionIds).size !== value.selectedOptionIds.length ||
      value.selectedOptionIds.some((id) => !q.options.some((option) => option.id === id))
    )
      invalid('多选答案包含无效或重复选项。');
  } else if (q.type === 'FILL_BLANK') {
    if (!Array.isArray(value.blanks)) invalid();
    const blanks = value.blanks as unknown[];
    blanks.forEach((blank) => keys(blank, ['blankId', 'values']));
    if (
      !sameIds(
        blanks.map((blank) => (blank as Record<string, unknown>).blankId),
        q.blanks.map((blank) => blank.id),
      )
    )
      invalid('请完整填写全部空位。');
    for (const blank of blanks as { blankId: string; values: unknown }[]) {
      const schema = q.blanks.find((entry) => entry.id === blank.blankId)!;
      if (
        !Array.isArray(blank.values) ||
        blank.values.length !== schema.valueCount ||
        blank.values.some((value) => typeof value !== 'string')
      )
        invalid('填空值的数量或类型不正确。');
    }
  } else if (q.type === 'JUDGMENT_REASON') {
    if (!Array.isArray(value.judgments)) invalid();
    const judgments = value.judgments as unknown[];
    judgments.forEach((judgment) => keys(judgment, ['statementId', 'value', 'reason']));
    if (
      !sameIds(
        judgments.map((entry) => (entry as Record<string, unknown>).statementId),
        q.statements.map((entry) => entry.id),
      )
    )
      invalid('请完整填写全部判断与理由。');
  } else if ('parts' in q) {
    if (!Array.isArray(value.parts)) invalid();
    const parts = value.parts as unknown[];
    parts.forEach((part) => keys(part, ['partId', 'text']));
    if (
      !sameIds(
        parts.map((part) => (part as Record<string, unknown>).partId),
        q.parts.map((part) => part.id),
      )
    )
      invalid('请完整填写全部分问。');
  }
  const draft = restoreAnswer(q, value);
  const issues = validateAnswer(q, draft);
  if (issues.length) invalid(issues[0].message);
  return serializeAnswer(q, draft);
}
export function canonical(record: QuestionVersionRecord, answer: Answer): unknown {
  if (answer.type === 'SINGLE_CHOICE') return answer.selectedOptionId;
  if (answer.type === 'MULTIPLE_CHOICE') return [...answer.selectedOptionIds].sort();
  if (answer.type === 'FILL_BLANK')
    return [...answer.blanks]
      .sort((a, b) => a.blankId.localeCompare(b.blankId))
      .map((blank) => {
        const values = blank.values.map(normalize);
        const unordered =
          record.question.type === 'FILL_BLANK' &&
          record.question.blanks.find((entry) => entry.id === blank.blankId)?.unordered;
        return [blank.blankId, unordered ? values.sort() : values];
      });
  if (answer.type === 'JUDGMENT_REASON')
    return [...answer.judgments]
      .sort((a, b) => a.statementId.localeCompare(b.statementId))
      .map((entry) => [entry.statementId, entry.value, normalize(entry.reason)]);
  return [...answer.parts]
    .sort((a, b) => a.partId.localeCompare(b.partId))
    .map((part) => [part.partId, normalize(part.text)]);
}
export function evaluate(record: QuestionVersionRecord, answer: Answer): Evaluation {
  const grading = record.grading;
  if (grading.mode === 'CHOICE_SET') {
    const ids =
      answer.type === 'SINGLE_CHOICE'
        ? [answer.selectedOptionId]
        : answer.type === 'MULTIPLE_CHOICE'
          ? answer.selectedOptionIds
          : [];
    const correct =
      JSON.stringify([...ids].sort()) === JSON.stringify([...grading.correctOptionIds].sort());
    return correct
      ? { status: 'CORRECT', isCorrect: true, score: 1 }
      : { status: 'INCORRECT', isCorrect: false, score: 0 };
  }
  if (grading.mode === 'ALIASES_OR_REVIEW' && answer.type === 'FILL_BLANK') {
    if (
      !sameIds(
        grading.blanks.map((blank) => blank.blankId),
        answer.blanks.map((blank) => blank.blankId),
      )
    )
      throw new Error('Invalid grading blank schema');
    const matches = grading.blanks.every((blank) => {
      const values = answer.blanks
        .find((entry) => entry.blankId === blank.blankId)!
        .values.map(normalize);
      const unordered =
        record.question.type === 'FILL_BLANK' &&
        record.question.blanks.find((entry) => entry.id === blank.blankId)?.unordered;
      if (blank.acceptedValues.length !== values.length)
        throw new Error('Invalid grading value count');
      if (!unordered)
        return values.every((value, index) =>
          blank.acceptedValues[index].some((alias) => normalize(alias) === value),
        );
      // Augmenting paths handle overlapping alias groups without greedy false negatives.
      const assigned = new Map<number, number>();
      const match = (index: number, visited: Set<number>): boolean => {
        for (const [group, aliases] of blank.acceptedValues.entries()) {
          if (visited.has(group) || !aliases.some((alias) => normalize(alias) === values[index]))
            continue;
          visited.add(group);
          const previous = assigned.get(group);
          if (previous === undefined || match(previous, visited)) {
            assigned.set(group, index);
            return true;
          }
        }
        return false;
      };
      return values.every((_, index) => match(index, new Set()));
    });
    if (matches) return { status: 'CORRECT', isCorrect: true, score: 1 };
  }
  return { status: 'PENDING_REVIEW', isCorrect: null, score: null };
}
