import type { Practice } from '@/shared/contracts';
import { restoreAnswer, type Drafts } from './answer-model';

export function draftKey(userId: string, practiceId: string) {
  return `zhixu:draft:v2:${userId}:${practiceId}`;
}
const signature = (practice: Practice) =>
  JSON.stringify(
    practice.items.map((item) => [item.id, item.question.id, item.question.version, item.position]),
  );
export function loadDraft(
  key: string,
  practice: Practice,
): { drafts: Drafts; locked: boolean; restored: boolean; warning: string } {
  const empty = Object.fromEntries(
    practice.items.map((item) => [item.id, restoreAnswer(item.question, null)]),
  );
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { drafts: empty, locked: false, restored: false, warning: '' };
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
      };
    return {
      drafts: Object.fromEntries(
        practice.items.map((item) => [
          item.id,
          restoreAnswer(item.question, saved.drafts[item.id]),
        ]),
      ),
      locked: saved.locked === true,
      restored: true,
      warning: '',
    };
  } catch {
    return {
      drafts: empty,
      locked: false,
      restored: false,
      warning: '当前浏览器无法恢复草稿，请勿依赖本地保存。',
    };
  }
}
export function saveDraft(key: string, practice: Practice, drafts: Drafts, locked: boolean) {
  localStorage.setItem(key, JSON.stringify({ signature: signature(practice), drafts, locked }));
}
