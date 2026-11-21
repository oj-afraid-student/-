'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth/session';
import { ApiClientError, errorMessage } from '@/shared/api/client';
import { GeometryFigure, MathText } from '@/shared/ui/common';
import type { GraphNode, GraphQuestion, GraphStructure } from './graph-model';

export function KnowledgePanel({
  data,
  focus,
  questions,
  select,
  questionId,
  selectQuestion,
}: {
  data: GraphStructure;
  focus: GraphNode;
  questions: GraphQuestion[];
  select: (id: string, question?: string) => void;
  questionId: string | null;
  selectQuestion: (id: string) => void;
}) {
  const requestedIndex = questions.findIndex((question) => question.id === questionId);
  const index = Math.max(0, requestedIndex);
  const [busy, setBusy] = useState<'one' | 'group' | null>(null);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const active = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const { api, expire } = useSession();
  const router = useRouter();
  const question = questions[index];
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    panel.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [index]);
  const children = data.nodes.filter((n) => n.parentId === focus.id);
  async function practice(mode: 'one' | 'group') {
    if (!question || locked.current || (mode === 'group' && questions.length > 100)) return;
    locked.current = true;
    setBusy(mode);
    setError('');
    const questionIds = mode === 'one' ? [question.id] : questions.map((entry) => entry.id);
    try {
      const result = await api.createPractice({ mode: 'EXPLICIT', questionIds });
      if (active.current) router.push('/practice/' + encodeURIComponent(result.id));
    } catch (error) {
      if (!active.current) return;
      if (error instanceof ApiClientError && error.status === 401) expire();
      setError(
        error instanceof ApiClientError && error.status === 404
          ? '关联题的发布状态有更新，请刷新题目后重试。'
          : errorMessage(error),
      );
    } finally {
      locked.current = false;
      if (active.current) setBusy(null);
    }
  }
  function change(next: number) {
    const selected = questions[next];
    if (!selected) return;
    selectQuestion(selected.id);
    setError('');
  }
  return (
    <section className="km-questions" ref={panel}>
      <header>
        <h2>关联题目</h2>
        <span className="tag">{questions.length} 道</span>
      </header>
      <div className="km-tabs">
        <span aria-current="page">知识点题目</span>
        <button disabled>
          上传的题目 <small>待接入</small>
        </button>
      </div>
      <p className="km-context" aria-live="polite">
        当前节点：<b>{focus.label}</b>
      </p>
      <details className="km-detail" key={focus.id}>
        <summary>知识详情{focus.code ? ' · ' + focus.code : ''}</summary>
        {focus.summary && <MathText>{focus.summary}</MathText>}
        {focus.paragraphs?.map((p, i) => (
          <MathText key={i}>{p}</MathText>
        ))}
        {!focus.paragraphs?.length && <p>选择下级知识点，阅读概念、条件与方法。</p>}
        {children.map((n) => (
          <button className="km-child-link" key={n.id} onClick={() => select(n.id)}>
            {n.label} ›
          </button>
        ))}
        {focus.figures?.map((f) => (
          <GeometryFigure key={f.id} figure={f} />
        ))}
      </details>
      {questionId && requestedIndex < 0 && (
        <p className="notice amber" role="status">
          原题当前不在此节点的可练习题目中，可查看下方其他关联题。
        </p>
      )}
      {question ? (
        <>
          <label className="km-picker">
            选择关联题目
            <select
              aria-label="选择关联题目"
              value={index}
              disabled={Boolean(busy)}
              onChange={(e) => change(Number(e.target.value))}
            >
              {questions.map((q, i) => (
                <option key={q.id} value={i}>
                  {q.id} · {q.title}
                </option>
              ))}
            </select>
          </label>
          <article className="km-question-card" key={question.id} aria-label="当前关联题目">
            <div className="row wrap">
              <span className="code-label">
                {question.id} · 第 {question.version} 版 · {index + 1}/{questions.length}
              </span>

              {question.needsReview && <span className="tag amber">内容待复核</span>}
            </div>
            <h3>{question.title}</h3>
            <MathText className="question-stem">{question.stem}</MathText>
            {question.figures.map((f) => (
              <GeometryFigure key={f.id} figure={f} />
            ))}
            {question.options?.map((o) => (
              <div className="km-option" key={o.id}>
                <b>{o.id}.</b>
                <MathText displayFractions>{o.text}</MathText>
              </div>
            ))}
            {question.prompts?.map((p, i) => (
              <MathText key={p.id}>{'（' + (i + 1) + '）' + p.prompt}</MathText>
            ))}
            <div className="km-tags" aria-label="题目关联知识点">
              {question.knowledgeIds.map((id) => {
                const n = data.nodes.find((n) => n.kind === 'point' && n.code === id);
                return n ? (
                  <button key={id} onClick={() => select(n.id, question.id)} title={n.label}>
                    {n.label}
                  </button>
                ) : null;
              })}
            </div>
          </article>
          <div className="km-question-actions">
            <button
              className="btn small"
              disabled={index === 0 || Boolean(busy)}
              onClick={() => change(index - 1)}
            >
              上一题
            </button>
            <button
              className="btn small"
              disabled={index === questions.length - 1 || Boolean(busy)}
              onClick={() => change(index + 1)}
            >
              下一题
            </button>
            <button
              className="btn small primary"
              disabled={Boolean(busy)}
              onClick={() => void practice('one')}
            >
              {busy === 'one' ? '正在创建…' : '练习此题'}
            </button>
          </div>
          {questions.length > 1 && questions.length <= 100 && (
            <button
              className="btn small wide"
              disabled={Boolean(busy)}
              onClick={() => void practice('group')}
            >
              {busy === 'group' ? '正在创建…' : `练习本节点全部 ${questions.length} 题`}
            </button>
          )}
          {questions.length > 100 && (
            <p className="km-future-note">整组练习最多 100 题，请选择下级节点缩小范围。</p>
          )}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="km-empty" role="status">
          <h3>暂无关联题目</h3>
          <p>可以先阅读知识详情，或选择其他知识点。</p>
        </div>
      )}
    </section>
  );
}
