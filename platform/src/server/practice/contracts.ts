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

/** catalog 由赵景言实现；当前是接口草稿，正式端口需支持已发布选题与按固定版本读取。 */
export interface PracticeCatalogPort {
  loadQuestionVersions(questionIds: string[]): Promise<QuestionVersionRecord[]>;
}
