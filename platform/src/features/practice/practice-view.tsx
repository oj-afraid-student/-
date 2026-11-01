'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Practice, SubmitPracticeRequest } from '@/shared/contracts';
import { ApiClientError, errorMessage } from '@/shared/api/client';
import { useResource } from '@/shared/api/use-resource';
import { ErrorState, LoadingState, PageHead } from '@/shared/ui/common';
import { Icon } from '@/shared/ui/icons';
import { useSession } from '@/features/auth/session';
import {
  prepareSubmission,
  validateAnswer,
  type AnswerDraft,
  type Drafts,
  type PracticeIssue,
} from './answer-model';
import { draftKey, loadDraft, saveDraft } from './draft-storage';
import { QuestionContent, QuestionRenderer } from './question-renderer';

export function PracticeView({ id }: { id: string }) {
  const { api, user } = useSession();
  const router = useRouter();
  const loader = useCallback((signal: AbortSignal) => api.practice(id, signal), [api, id]);
  const state = useResource(loader);
  useEffect(() => {
    if (state.data?.status === 'SUBMITTED' && state.data.submissionId)
      router.replace(`/results/${encodeURIComponent(state.data.submissionId)}`);
  }, [state.data, router]);
  if (state.loading || state.data?.status === 'SUBMITTED')
    return <LoadingState text={state.data ? '正在读取已提交的结果…' : '正在读取练习…'} />;
  if (state.error) return <ErrorState message={state.error} retry={state.retry} />;
  if (!state.data || !user) return null;
  if (!state.data.items.length || state.data.totalCount !== state.data.items.length)
    return <ErrorState message="练习题项与题数不一致，请联系接口维护人。" retry={state.retry} />;
  return <PracticeEditor key={`${user.id}:${id}`} practice={state.data} userId={user.id} />;
}

function PracticeEditor({ practice, userId }: { practice: Practice; userId: string }) {
  const { api, expire } = useSession();
  const router = useRouter();
  const key = draftKey(userId, practice.id);
  const [initial] = useState(() => loadDraft(key, practice));
  const [drafts, setDrafts] = useState<Drafts>(initial.drafts);
  const [locked, setLocked] = useState(initial.locked);
  const [index, setIndex] = useState(0);
  const [issues, setIssues] = useState<PracticeIssue[]>([]);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const sending = useRef(false);
  const snapshot = useRef<SubmitPracticeRequest | null>(
    initial.locked ? prepareSubmission(practice, initial.drafts).payload : null,
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const item = practice.items[index];
  const completed = practice.items.filter(
    (entry) => !validateAnswer(entry.question, drafts[entry.id]).length,
  ).length;
  function changeAnswer(draft: AnswerDraft) {
    const updated = { ...drafts, [item.id]: draft };
    setDrafts(updated);
    setIssues((current) => current.filter((issue) => issue.itemId !== item.id));
    // Persist before returning from the input event, including an immediate browser refresh.
    try {
      saveDraft(key, practice, updated, locked);
      setStorageWarning('');
    } catch {
      setStorageWarning('草稿保存失败。请保持本页打开，提交前避免刷新。');
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        saveDraft(key, practice, drafts, locked);
        setStorageWarning('');
        setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      } catch {
        setStorageWarning('草稿保存失败。请保持本页打开，提交前避免刷新。');
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [key, practice, drafts, locked]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (locked || busy || storageWarning) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [locked, busy, storageWarning]);
  function navigate(next: number) {
    setIndex(next);
    setConfirm(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  async function send() {
    if (sending.current) return;
    const prepared = snapshot.current
      ? { payload: snapshot.current, issues: [] }
      : prepareSubmission(practice, drafts);
    setIssues(prepared.issues);
    if (!prepared.payload) {
      const first = practice.items.findIndex((entry) => entry.id === prepared.issues[0]?.itemId);
      if (first >= 0) navigate(first);
      return;
    }
    snapshot.current = prepared.payload;
    setLocked(true);
    setBusy(true);
    setError('');
    setConfirm(false);
    sending.current = true;
    try {
      saveDraft(key, practice, drafts, true);
    } catch {
      setStorageWarning('当前无法保存提交快照，请保持页面打开。');
    }
    try {
      const result = await api.submit(practice.id, prepared.payload);
      try {
        localStorage.removeItem(key);
      } catch {
        /* Submission is already saved by the server. */
      }
      router.replace(`/results/${encodeURIComponent(result.submissionId)}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 400) {
        snapshot.current = null;
        setLocked(false);
      }
      if (error instanceof ApiClientError && error.status === 401) expire();
      if (!(error instanceof ApiClientError && error.status === 400)) {
        try {
          const current = await api.practice(practice.id);
          if (current.status === 'SUBMITTED' && current.submissionId) {
            try {
              localStorage.removeItem(key);
            } catch {}
            router.replace(`/results/${encodeURIComponent(current.submissionId)}`);
            return;
          }
        } catch {
          /* Keep the exact original snapshot until an idempotent retry succeeds. */
        }
      }
      setError(errorMessage(error));
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }
  function startSubmit() {
    const prepared = prepareSubmission(practice, drafts);
    setIssues(prepared.issues);
    setError('');
    if (prepared.issues.length) {
      navigate(practice.items.findIndex((entry) => entry.id === prepared.issues[0].itemId));
      return;
    }
    setConfirm(true);
  }
  return (
    <>
      <PageHead
        eyebrow="PRACTICE / 独立思考"
        title="立体几何练习"
        description="读清条件，写出依据。所有题目完成后统一提交。"
        actions={
          <Link className="btn" href="/learn">
            返回学习
          </Link>
        }
      />
      {storageWarning && (
        <p className="notice amber" role="alert">
          {storageWarning}
        </p>
      )}
      {initial.restored && !locked && (
        <p className="notice">已恢复此账号在当前浏览器中的作答草稿。</p>
      )}
      {locked && (
        <p className="notice amber" role="status">
          {busy
            ? '正在提交，请稍候。'
            : '提交结果尚待确认。原答案已锁定，请使用原内容重试；如已保存，将直接进入同一份结果。'}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {issues.length > 0 && (
        <div className="notice error" role="alert">
          <strong>还有 {new Set(issues.map((issue) => issue.itemId)).size} 题需要补全</strong>
          <div className="issue-links">
            {practice.items
              .filter((entry) => issues.some((issue) => issue.itemId === entry.id))
              .map((entry) => (
                <button key={entry.id} onClick={() => navigate(practice.items.indexOf(entry))}>
                  第 {entry.position} 题
                </button>
              ))}
          </div>
        </div>
      )}
      <div className="quiz-layout">
        <section className="panel question-panel" aria-busy={busy}>
          <div className="row between">
            <span className="eyebrow">
              QUESTION {String(index + 1).padStart(2, '0')}{' '}
              <span className="muted">/ {practice.totalCount}</span>
            </span>
            <span className="field-hint">{item.question.sourceLabel}</span>
          </div>
          <h2 ref={titleRef} tabIndex={-1} className="sr-only">
            第 {item.position} 题
          </h2>
          <QuestionContent question={item.question} />
          <QuestionRenderer
            key={item.id}
            prefix={item.id}
            question={item.question}
            draft={drafts[item.id]}
            disabled={locked || busy}
            issues={issues.filter((issue) => issue.itemId === item.id)}
            onChange={changeAnswer}
          />
          <div className="quiz-footer">
            <button className="btn" disabled={index === 0} onClick={() => navigate(index - 1)}>
              上一题
            </button>
            <span className="field-hint">
              第 {index + 1} / {practice.totalCount} 题
            </span>
            {index < practice.items.length - 1 ? (
              <button className="btn primary" onClick={() => navigate(index + 1)}>
                下一题
                <Icon name="arrow" />
              </button>
            ) : (
              <button className="btn primary" disabled={busy || locked} onClick={startSubmit}>
                检查并提交
              </button>
            )}
          </div>
        </section>
        <aside className="panel practice-sidebar">
          <div className="row between">
            <h2>作答进度</h2>
            <span className="tag green">
              {completed} / {practice.totalCount}
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="已完成题目"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={practice.totalCount}
          >
            <span style={{ width: `${(completed / practice.totalCount) * 100}%` }} />
          </div>
          <div className="question-numbers" aria-label="题号导航">
            {practice.items.map((entry, i) => (
              <button
                key={entry.id}
                onClick={() => navigate(i)}
                className={`${i === index ? 'current' : ''} ${!validateAnswer(entry.question, drafts[entry.id]).length ? 'answered' : ''} ${issues.some((issue) => issue.itemId === entry.id) ? 'incomplete' : ''}`}
                aria-label={`第 ${entry.position} 题${!validateAnswer(entry.question, drafts[entry.id]).length ? '，已完成' : '，未完成'}`}
                aria-current={i === index ? 'step' : undefined}
              >
                {entry.position}
              </button>
            ))}
          </div>
          <p className="field-hint">绿色表示已填写完整，未代表答案正确。</p>
          <hr />
          <p className="draft-note">
            <Icon name="clock" />
            {savedAt ? `${savedAt} 草稿已保存在本机` : '正在保存本机草稿…'}
          </p>
          <p className="field-hint">提交后才计入练习记录。退出账号将清除本机草稿。</p>
          <button
            className="btn primary wide"
            disabled={busy}
            onClick={() => (locked ? void send() : startSubmit())}
          >
            {busy ? '正在提交…' : locked ? '使用原答案重试提交' : '检查并提交'}
          </button>
          <p className="field-hint">判断说明及证明过程需要复核，未复核时不产生最终总分。</p>
        </aside>
      </div>
      {confirm && (
        <section className="panel submit-confirm" aria-label="确认提交">
          <div>
            <h2>已完成全部 {practice.totalCount} 题</h2>
            <p>提交后无法修改本次答案。需要再次练习时，可创建新题组。</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setConfirm(false)}>
              继续检查
            </button>
            <button className="btn primary" onClick={() => void send()} disabled={busy}>
              确认提交全部答案
            </button>
          </div>
        </section>
      )}
    </>
  );
}
