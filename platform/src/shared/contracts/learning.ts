import type { ApiResponse, CurrentUser, Figure, PracticeStatus } from './index';

/** 契约 v2：字段约束与状态语义见 docs/api.md；类型不是运行时校验器。 */
export type Difficulty = 'BASIC' | 'INTERMEDIATE' | 'COMPREHENSIVE';
export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'FILL_BLANK'
  | 'JUDGMENT_REASON'
  | 'PROOF'
  | 'PROOF_CALCULATION'
  | 'EXPLORATION_PROOF'
  | 'COMPREHENSIVE';
export interface Credentials {
  username: string;
  password: string;
}
export interface LogoutResult {
  success: true;
}
export interface KnowledgeSummary {
  id: string;
  title: string;
  summary: string;
  order: number;
  extension: boolean;
  knowledgeIds: string[];
  questionIds: string[];
}
export interface KnowledgeSection {
  id: string;
  title: string;
  paragraphs: string[];
}
export interface KnowledgeDetail extends KnowledgeSummary {
  sections: KnowledgeSection[];
  figures: Figure[];
}
export interface QuestionBase {
  id: string;
  version: number;
  title: string;
  stem: string;
  difficulty: Difficulty;
  knowledgeIds: string[];
  unitIds: string[];
  figures: Figure[];
  sourceLabel: string;
}
export interface Blank {
  id: string;
  label: string;
  valueCount: number;
  unordered: boolean;
  unit: string | null;
}
export interface WrittenPart {
  id: string;
  prompt: string;
}
export type PublicQuestion = QuestionBase &
  (
    | { type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE'; options: { id: string; text: string }[] }
    | { type: 'FILL_BLANK'; blanks: Blank[] }
    | { type: 'JUDGMENT_REASON'; statements: WrittenPart[] }
    | {
        type: 'PROOF' | 'PROOF_CALCULATION' | 'EXPLORATION_PROOF' | 'COMPREHENSIVE';
        parts: WrittenPart[];
      }
  );
export type Answer =
  | { type: 'SINGLE_CHOICE'; selectedOptionId: string }
  | { type: 'MULTIPLE_CHOICE'; selectedOptionIds: string[] }
  | { type: 'FILL_BLANK'; blanks: { blankId: string; values: string[] }[] }
  | {
      type: 'JUDGMENT_REASON';
      judgments: { statementId: string; value: boolean; reason: string }[];
    }
  | {
      type: 'PROOF' | 'PROOF_CALCULATION' | 'EXPLORATION_PROOF' | 'COMPREHENSIVE';
      parts: { partId: string; text: string }[];
    };
/** ALL 不设置 count；FILTERED 仅按当前目录中匹配题选取；EXPLICIT 保留给定顺序。 */
export type CreatePracticeRequest =
  | { mode: 'ALL' }
  | {
      mode: 'FILTERED';
      knowledgePointId?: string;
      difficulty?: Difficulty;
      questionTypes?: QuestionType[];
      count?: number;
    }
  | { mode: 'EXPLICIT'; questionIds: string[] };
export interface PracticeItem {
  id: string;
  position: number;
  question: PublicQuestion;
}
export interface Practice {
  id: string;
  status: PracticeStatus;
  createdAt: string;
  totalCount: number;
  selection: CreatePracticeRequest;
  items: PracticeItem[];
  submissionId: string | null;
}
export interface SubmitPracticeRequest {
  answers: { practiceItemId: string; answer: Answer }[];
}
export type GradingStatus = 'GRADED' | 'PENDING_REVIEW';
export interface SubmitPracticeResult {
  submissionId: string;
  practiceId: string;
  gradingStatus: GradingStatus;
}
export type Evaluation =
  | { status: 'CORRECT'; isCorrect: true; score: 1 }
  | { status: 'INCORRECT'; isCorrect: false; score: 0 }
  | { status: 'PENDING_REVIEW'; isCorrect: null; score: null };
export interface ResultItem {
  practiceItemId: string;
  question: PublicQuestion;
  answer: Answer;
  evaluation: Evaluation;
  reference: { answerText: string; explanation: string };
}
export interface SubmissionSummary {
  id: string;
  practiceId: string;
  submittedAt: string;
  totalCount: number;
  gradedCount: number;
  pendingCount: number;
  correctCount: number;
  gradingStatus: GradingStatus;
  /** 待复核时总分为空；correctCount 仅代表已判题数中的正确数。 */
  score: number | null;
  maxScore: number;
}
export interface SubmissionDetail extends SubmissionSummary {
  items: ResultItem[];
}
export interface HistoryQuery {
  page?: number;
  pageSize?: number;
}
export interface HistoryPage {
  items: SubmissionSummary[];
  total: number;
  page: number;
  pageSize: number;
}
/** 键对应现有 11 个业务入口；所有 Response 均经过统一 ApiResponse 包装。 */
export interface BusinessEndpoints {
  'POST /auth/register': { request: Credentials; response: ApiResponse<CurrentUser> };
  'POST /auth/login': { request: Credentials; response: ApiResponse<CurrentUser> };
  'POST /auth/logout': { request: null; response: ApiResponse<LogoutResult> };
  'GET /auth/me': { request: null; response: ApiResponse<CurrentUser> };
  'GET /knowledge-points': { request: null; response: ApiResponse<KnowledgeSummary[]> };
  'GET /knowledge-points/:id': { request: null; response: ApiResponse<KnowledgeDetail> };
  'POST /practices': { request: CreatePracticeRequest; response: ApiResponse<Practice> };
  'GET /practices/:id': { request: null; response: ApiResponse<Practice> };
  'POST /practices/:id/submit': {
    request: SubmitPracticeRequest;
    response: ApiResponse<SubmitPracticeResult>;
  };
  'GET /me/submissions': { request: HistoryQuery; response: ApiResponse<HistoryPage> };
  'GET /me/submissions/:id': { request: null; response: ApiResponse<SubmissionDetail> };
}
