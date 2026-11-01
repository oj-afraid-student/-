import type { PublicQuestion } from '../../shared/contracts';

/** 仅供服务端使用；不能通过公开题目响应或客户端 import 导出答案库。 */
export interface QuestionVersionRecord {
  question: PublicQuestion;
  reference: { answerText: string; explanation: string };
  grading:
    | { mode: 'CHOICE_SET'; correctOptionIds: string[] }
    | { mode: 'ALIASES_OR_REVIEW'; blanks: { blankId: string; acceptedValues: string[][] }[] }
    | { mode: 'REVIEW_REQUIRED' };
  source: { document: string; questionId: string; note: string };
  publicationStatus: 'DRAFT';
}

/** catalog 由李梓禾实现；每次练习固定题目版本，不能在提交时读取已更新的最新版。 */
export interface PracticeCatalogPort {
  loadQuestionVersions(questionIds: string[]): Promise<QuestionVersionRecord[]>;
}
