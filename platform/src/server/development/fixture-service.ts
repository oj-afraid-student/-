import 'server-only';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import unitFixtures from '../../../fixtures/content/knowledge-units.json';
import bankFixtures from '../../../fixtures/server/question-bank.json';
import type {
  Answer,
  CreatePracticeRequest,
  CurrentUser,
  Evaluation,
  KnowledgeDetail,
  Practice,
  SubmissionDetail,
} from '@/shared/contracts';
import type { QuestionVersionRecord } from '@/server/practice/contracts';
import { ApiError, success } from '@/server/http';
import { restoreAnswer, serializeAnswer, validateAnswer } from '@/features/practice/answer-model';

/** Isolated, volatile development adapter. Never implements or replaces /api/v1. */
interface Account {
  user: CurrentUser;
  salt: string;
  hash: Buffer;
}
interface Entry {
  owner: string;
  practice: Practice;
  versions: QuestionVersionRecord[];
  fingerprint?: string;
}
interface Store {
  accounts: Map<string, Account>;
  sessions: Map<string, { user: CurrentUser; expires: number }>;
  practices: Map<string, Entry>;
  submissions: Map<string, { owner: string; detail: SubmissionDetail }>;
}
const globals = globalThis as typeof globalThis & { zhixuDevelopmentStore?: Store };
const store: Store = (globals.zhixuDevelopmentStore ??= {
  accounts: new Map(),
  sessions: new Map(),
  practices: new Map(),
  submissions: new Map(),
});
const units = unitFixtures as KnowledgeDetail[];
const bank = bankFixtures as QuestionVersionRecord[];
const cookieName = 'zhixu_development_session';
const invalid = (message = '请求字段不符合契约。'): never => {
  throw new ApiError('VALIDATION_ERROR', 400, message);
};
const missing = (): never => {
  throw new ApiError('NOT_FOUND', 404, '没有找到可访问的资源。');
};
const normalize = (value: string) =>
  value.normalize('NFKC').replace(/\s/g, '').replaceAll('／', '/');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function keys(
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
function sameIds(actual: unknown[], expected: string[]) {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((id) => typeof id === 'string' && expected.includes(id))
  );
}
async function body(request: NextRequest): Promise<unknown> {
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024) invalid('请求内容不能超过 1 MiB。');
  try {
    return JSON.parse(raw);
  } catch {
    return invalid('请求需要合法的 JSON。');
  }
}
async function noBody(request: NextRequest) {
  if ((await request.text()).length) invalid('此接口不接受请求体。');
}
function currentUser(request: NextRequest) {
  const token = request.cookies.get(cookieName)?.value;
  const session = token ? store.sessions.get(token) : undefined;
  if (!session || session.expires < Date.now()) {
    if (token) store.sessions.delete(token);
    throw new ApiError('UNAUTHENTICATED', 401, '请先登录后继续。');
  }
  return session.user;
}
function credentials(value: unknown) {
  keys(value, ['username', 'password']);
  if (typeof value.username !== 'string' || typeof value.password !== 'string') invalid();
  const username = (value.username as string).trim().toLowerCase();
  const password = value.password as string;
  if (!/^[a-z0-9_]{4,20}$/.test(username) || password.length < 8 || password.length > 64)
    invalid('请检查用户名格式与密码长度。');
  return { username, password };
}
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/api/development',
  maxAge: 8 * 60 * 60,
};

function selection(value: unknown): {
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
      if (!['BASIC', 'INTERMEDIATE', 'COMPREHENSIVE'].includes(String(value.difficulty))) invalid();
      versions = versions.filter((record) => record.question.difficulty === value.difficulty);
    }
    if (value.questionTypes !== undefined) {
      const allowed = new Set(bank.map((record) => record.question.type));
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
    if (!versions.length) missing();
    if (value.count !== undefined) {
      if (
        !Number.isInteger(value.count) ||
        (value.count as number) < 1 ||
        (value.count as number) > 100
      )
        invalid('题量应为 1—100 的整数。');
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

function readAnswer(record: QuestionVersionRecord, value: unknown): Answer {
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
function canonical(record: QuestionVersionRecord, answer: Answer): unknown {
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
function evaluate(record: QuestionVersionRecord, answer: Answer): Evaluation {
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
    const matches = grading.blanks.every((blank) => {
      const values = answer.blanks
        .find((entry) => entry.blankId === blank.blankId)!
        .values.map(normalize);
      const unordered =
        record.question.type === 'FILL_BLANK' &&
        record.question.blanks.find((entry) => entry.id === blank.blankId)?.unordered;
      const used = new Set<number>();
      return values.every((value, index) => {
        const group = unordered
          ? blank.acceptedValues.findIndex(
              (aliases, i) => !used.has(i) && aliases.some((alias) => normalize(alias) === value),
            )
          : blank.acceptedValues[index]?.some((alias) => normalize(alias) === value)
            ? index
            : -1;
        if (group < 0) return false;
        used.add(group);
        return true;
      });
    });
    if (matches) return { status: 'CORRECT', isCorrect: true, score: 1 };
  }
  return { status: 'PENDING_REVIEW', isCorrect: null, score: null };
}

export async function handleDevelopment(
  request: NextRequest,
  segments: string[],
): Promise<NextResponse> {
  const path = segments.join('/');
  const method = request.method;
  // Next dev may normalize nextUrl.hostname to localhost. Host preserves the browser's origin.
  const origin = request.headers.get('origin');
  const requestOrigin = `${request.nextUrl.protocol}//${request.headers.get('host')}`;
  if (method === 'POST' && origin && origin !== requestOrigin)
    throw new ApiError('VALIDATION_ERROR', 400, '开发接口仅接受同源请求。');
  if (method === 'POST' && path === 'auth/register') {
    const { username, password } = credentials(await body(request));
    if (store.accounts.has(username))
      throw new ApiError('CONFLICT', 409, '此用户名已被使用，请换一个。');
    const user = { id: randomUUID(), username };
    const salt = randomBytes(16).toString('hex');
    store.accounts.set(username, { user, salt, hash: scryptSync(password, salt, 32) });
    return success(user, 201);
  }
  if (method === 'POST' && path === 'auth/login') {
    const { username, password } = credentials(await body(request));
    const account = store.accounts.get(username);
    const hash = scryptSync(password, account?.salt ?? 'missing-development-account', 32);
    if (!account || !timingSafeEqual(hash, account.hash))
      throw new ApiError('UNAUTHENTICATED', 401, '用户名或密码不正确。');
    const token = randomBytes(32).toString('hex');
    store.sessions.set(token, { user: account.user, expires: Date.now() + 8 * 60 * 60 * 1000 });
    const response = success(account.user);
    response.cookies.set(cookieName, token, {
      ...cookieOptions,
      secure: request.nextUrl.protocol === 'https:',
    });
    return response;
  }
  if (method === 'POST' && path === 'auth/logout') {
    await noBody(request);
    const token = request.cookies.get(cookieName)?.value;
    if (token) store.sessions.delete(token);
    const response = success({ success: true });
    response.cookies.set(cookieName, '', { ...cookieOptions, maxAge: 0 });
    return response;
  }
  const user = currentUser(request);
  if (method === 'GET') await noBody(request);
  if (method === 'GET' && path === 'auth/me') return success(user);
  if (method === 'GET' && path === 'knowledge-points')
    return success(
      units.map((unit) => {
        const { sections: _sections, figures: _figures, ...summary } = unit;
        void _sections;
        void _figures;
        return summary;
      }),
    );
  if (method === 'GET' && segments.length === 2 && segments[0] === 'knowledge-points')
    return success(units.find((unit) => unit.id === segments[1]) ?? missing());
  if (method === 'POST' && path === 'practices') {
    const chosen = selection(await body(request));
    const practice: Practice = {
      id: randomUUID(),
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      totalCount: chosen.versions.length,
      selection: chosen.selection,
      items: chosen.versions.map((record, index) => ({
        id: randomUUID(),
        position: index + 1,
        question: record.question,
      })),
      submissionId: null,
    };
    store.practices.set(practice.id, { owner: user.id, practice, versions: chosen.versions });
    return success(practice, 201);
  }
  if (segments[0] === 'practices' && segments.length >= 2) {
    const entry = store.practices.get(segments[1]);
    if (!entry || entry.owner !== user.id) return missing();
    if (method === 'GET' && segments.length === 2) return success(entry.practice);
    if (method === 'POST' && segments.length === 3 && segments[2] === 'submit') {
      const value = await body(request);
      keys(value, ['answers']);
      if (!Array.isArray(value.answers)) invalid();
      const rawAnswers = value.answers as unknown[];
      rawAnswers.forEach((answer) => keys(answer, ['practiceItemId', 'answer']));
      if (
        !sameIds(
          rawAnswers.map((answer) => (answer as Record<string, unknown>).practiceItemId),
          entry.practice.items.map((item) => item.id),
        )
      )
        invalid('提交必须完整覆盖本次练习的每一道题。');
      const answers = entry.practice.items.map((item, index) => {
        const raw = (rawAnswers as { practiceItemId: string; answer: unknown }[]).find(
          (answer) => answer.practiceItemId === item.id,
        )!;
        return readAnswer(entry.versions[index], raw.answer);
      });
      const fingerprint = JSON.stringify(
        answers.map((answer, index) => canonical(entry.versions[index], answer)),
      );
      if (entry.practice.submissionId) {
        if (entry.fingerprint !== fingerprint)
          throw new ApiError('CONFLICT', 409, '本次练习已提交，修改答案请创建新练习。');
        const detail = store.submissions.get(entry.practice.submissionId)!.detail;
        return success({
          submissionId: detail.id,
          practiceId: detail.practiceId,
          gradingStatus: detail.gradingStatus,
        });
      }
      const items = entry.practice.items.map((item, index) => ({
        practiceItemId: item.id,
        question: item.question,
        answer: answers[index],
        evaluation: evaluate(entry.versions[index], answers[index]),
        reference: entry.versions[index].reference,
      }));
      const correctCount = items.filter((item) => item.evaluation.status === 'CORRECT').length;
      const pendingCount = items.filter(
        (item) => item.evaluation.status === 'PENDING_REVIEW',
      ).length;
      const detail: SubmissionDetail = {
        id: randomUUID(),
        practiceId: entry.practice.id,
        submittedAt: new Date().toISOString(),
        totalCount: items.length,
        gradedCount: items.length - pendingCount,
        pendingCount,
        correctCount,
        gradingStatus: pendingCount ? 'PENDING_REVIEW' : 'GRADED',
        score: pendingCount ? null : correctCount,
        maxScore: items.length,
        items,
      };
      store.submissions.set(detail.id, { owner: user.id, detail });
      entry.practice.status = 'SUBMITTED';
      entry.practice.submissionId = detail.id;
      entry.fingerprint = fingerprint;
      return success(
        {
          submissionId: detail.id,
          practiceId: detail.practiceId,
          gradingStatus: detail.gradingStatus,
        },
        201,
      );
    }
  }
  if (method === 'GET' && path === 'me/submissions') {
    if (
      [...request.nextUrl.searchParams.keys()].some((key) => !['page', 'pageSize'].includes(key)) ||
      ['page', 'pageSize'].some((key) => request.nextUrl.searchParams.getAll(key).length > 1)
    )
      invalid();
    const pageText = request.nextUrl.searchParams.get('page') ?? '1';
    const sizeText = request.nextUrl.searchParams.get('pageSize') ?? '20';
    if (!/^\d+$/.test(pageText) || !/^\d+$/.test(sizeText)) invalid('分页参数应为整数。');
    const page = +pageText,
      pageSize = +sizeText;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      invalid('分页参数超出范围。');
    const all = [...store.submissions.values()]
      .filter((entry) => entry.owner === user.id)
      .map((entry) => entry.detail)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id));
    return success({
      items: all.slice((page - 1) * pageSize, page * pageSize).map((detail) => {
        const { items: _items, ...summary } = detail;
        void _items;
        return summary;
      }),
      total: all.length,
      page,
      pageSize,
    });
  }
  if (
    method === 'GET' &&
    segments.length === 3 &&
    segments[0] === 'me' &&
    segments[1] === 'submissions'
  ) {
    const entry = store.submissions.get(segments[2]);
    if (!entry || entry.owner !== user.id) return missing();
    return success(entry.detail);
  }
  return missing();
}
