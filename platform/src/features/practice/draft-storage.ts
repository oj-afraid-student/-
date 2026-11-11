import type { Practice, SubmitPracticeRequest } from '@/shared/contracts';
import { prepareSubmission, restoreAnswer, type Drafts } from './answer-model';

export function draftKey(userId: string, practiceId: string) {
  return 'zhixu:draft:v2:' + userId + ':' + practiceId;
}
const signature = (practice: Practice) =>
  JSON.stringify(
    practice.items.map((item) => [item.id, item.question.id, item.question.version, item.position]),
  );
export function loadDraft(
  key: string,
  practice: Practice,
): {
  drafts: Drafts;
  locked: boolean;
  restored: boolean;
  warning: string;
  pending: SubmitPracticeRequest | null;
} {
  const empty = Object.fromEntries(
    practice.items.map((item) => [item.id, restoreAnswer(item.question, null)]),
  );
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { drafts: empty, locked: false, restored: false, warning: '', pending: null };
    const saved = JSON.parse(raw);
    if (
      !saved ||
      saved.signature !== signature(practice) ||
      !saved.drafts ||
      typeof saved.drafts !== 'object'
    )
      return {
        drafts: empty,
        locked: false,
        restored: false,
        warning: '旧草稿与当前题目版本不一致，未自动套用。',
        pending: null,
      };
    const drafts = Object.fromEntries(
      practice.items.map((item) => [item.id, restoreAnswer(item.question, saved.drafts[item.id])]),
    );
    const locked = saved.locked === true;
    const prepared = locked ? prepareSubmission(practice, drafts).payload : null;
    // Reconstruct exact schema fields; never trust arbitrary objects from browser storage.
    // Legacy v2 locked drafts did not contain a pending object; their validated drafts remain usable.
    const matches =
      prepared &&
      (saved.pending === undefined || JSON.stringify(prepared) === JSON.stringify(saved.pending));
    return {
      drafts,
      locked,
      restored: true,
      pending: matches ? prepared : null,
      warning:
        locked && !matches
          ? '无法恢复完整的原提交快照，请查询提交状态；如仍未提交，可创建新练习。'
          : '',
    };
  } catch {
    return {
      drafts: empty,
      locked: false,
      restored: false,
      warning: '当前浏览器无法恢复草稿，请勿依赖本地保存。',
      pending: null,
    };
  }
}
export function saveDraft(
  key: string,
  practice: Practice,
  drafts: Drafts,
  locked: boolean,
  pending?: SubmitPracticeRequest | null,
) {
  localStorage.setItem(
    key,
    JSON.stringify({
      signature: signature(practice),
      drafts,
      locked,
      ...(pending === undefined ? {} : { pending }),
    }),
  );
}
