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
  publicationStatus: 'DRAFT' | 'PUBLISHED';
}

/** 内部版本 UUID 只用于数据库引用，不进入公开题目 DTO。 */
export interface StoredQuestionVersion extends QuestionVersionRecord {
  versionId: string;
}

/** 同一事务内读取；发布审核和内容导入由赵景言维护。 */
export interface PracticeCatalogPort {
  /** 每题最新已发布版本，按题号排序；草稿新版不遮蔽已发布旧版。 */
  listPublished(): Promise<StoredQuestionVersion[]>;
  /** 按内部版本 ID 原序读取，包括已下架版本；缺失版本必须报错。 */
  loadQuestionVersions(versionIds: string[]): Promise<StoredQuestionVersion[]>;
}
