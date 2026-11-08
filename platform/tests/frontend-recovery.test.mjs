import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { loadDraft, saveDraft, draftKey } =
  await import('../src/features/practice/draft-storage.ts');
const { emptyAnswer, prepareSubmission } = await import('../src/features/practice/answer-model.ts');

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const practice = read('../fixtures/api/practice/create-response.json').data;
const request = read('../fixtures/api/practice/submit-request.json');
const drafts = Object.fromEntries(
  request.answers.map((entry) => [entry.practiceItemId, entry.answer]),
);
const data = new Map();
globalThis.localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
  removeItem: (key) => data.delete(key),
};

test('原提交快照与草稿一并落盘，恢复后请求内容不变', () => {
  data.clear();
  const key = draftKey('student-a', practice.id);
  const pending = prepareSubmission(practice, drafts).payload;
  saveDraft(key, practice, drafts, true, pending);
  const loaded = loadDraft(key, practice);
  assert.equal(loaded.locked, true);
  assert.deepEqual(loaded.pending, pending);
  assert.deepEqual(prepareSubmission(practice, loaded.drafts).payload, pending);
});
test('兼容旧 v2 锁定草稿；账号、练习和题目版本隔离', () => {
  data.clear();
  const key = draftKey('student-a', practice.id);
  saveDraft(key, practice, drafts, true);
  assert.ok(loadDraft(key, practice).pending);
  assert.equal(loadDraft(draftKey('student-b', practice.id), practice).restored, false);
  assert.equal(loadDraft(draftKey('student-a', 'another-practice'), practice).restored, false);
  const changed = structuredClone(practice);
  changed.items[0].question.version++;
  const version = loadDraft(key, changed);
  assert.equal(version.restored, false);
  assert.match(version.warning, /版本不一致/);
});
test('篡改或不完整的锁定快照不会被重新拼成另一次提交', () => {
  data.clear();
  const key = draftKey('student-a', practice.id);
  const pending = prepareSubmission(practice, drafts).payload;
  saveDraft(key, practice, drafts, true, { ...pending, extra: 'forged' });
  let loaded = loadDraft(key, practice);
  assert.equal(loaded.locked, true);
  assert.equal(loaded.pending, null);
  assert.match(loaded.warning, /原提交快照/);
  const incomplete = { ...drafts, [practice.items[0].id]: emptyAnswer(practice.items[0].question) };
  saveDraft(key, practice, incomplete, true);
  loaded = loadDraft(key, practice);
  assert.equal(loaded.locked, true);
  assert.equal(loaded.pending, null);
});
test('存储损坏和写入失败均可识别，普通草稿仍可恢复', () => {
  data.clear();
  const key = draftKey('student-a', practice.id);
  data.set(key, '{broken');
  assert.match(loadDraft(key, practice).warning, /无法恢复/);
  saveDraft(key, practice, drafts, false, null);
  assert.equal(loadDraft(key, practice).restored, true);
  assert.equal(loadDraft(key, practice).pending, null);
  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error('quota');
  };
  try {
    assert.throws(() => saveDraft(key, practice, drafts, false), /quota/);
  } finally {
    localStorage.setItem = original;
  }
});
