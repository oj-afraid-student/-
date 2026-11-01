import type {
  Credentials,
  CreatePracticeRequest,
  CurrentUser,
  HistoryPage,
  HistoryQuery,
  KnowledgeDetail,
  KnowledgeSummary,
  LogoutResult,
  Practice,
  SubmissionDetail,
  SubmitPracticeRequest,
  SubmitPracticeResult,
} from '@/shared/contracts';
import { request } from './client';

export function createLearningApi(base = '/api/v1') {
  const get = <T>(path: string, signal?: AbortSignal) => request<T>(base, path, { signal });
  const post = <T>(path: string, body?: unknown) =>
    request<T>(base, path, { method: 'POST', body });
  return {
    register: (credentials: Credentials) => post<CurrentUser>('/auth/register', credentials),
    login: (credentials: Credentials) => post<CurrentUser>('/auth/login', credentials),
    logout: () => post<LogoutResult>('/auth/logout'),
    me: (signal?: AbortSignal) => get<CurrentUser>('/auth/me', signal),
    knowledgePoints: (signal?: AbortSignal) => get<KnowledgeSummary[]>('/knowledge-points', signal),
    knowledgePoint: (id: string, signal?: AbortSignal) =>
      get<KnowledgeDetail>(`/knowledge-points/${encodeURIComponent(id)}`, signal),
    createPractice: (selection: CreatePracticeRequest) => post<Practice>('/practices', selection),
    practice: (id: string, signal?: AbortSignal) =>
      get<Practice>(`/practices/${encodeURIComponent(id)}`, signal),
    submit: (id: string, answers: SubmitPracticeRequest) =>
      post<SubmitPracticeResult>(`/practices/${encodeURIComponent(id)}/submit`, answers),
    history: ({ page = 1, pageSize = 20 }: HistoryQuery = {}, signal?: AbortSignal) =>
      get<HistoryPage>(`/me/submissions?page=${page}&pageSize=${pageSize}`, signal),
    submission: (id: string, signal?: AbortSignal) =>
      get<SubmissionDetail>(`/me/submissions/${encodeURIComponent(id)}`, signal),
  };
}

export type LearningApi = ReturnType<typeof createLearningApi>;
