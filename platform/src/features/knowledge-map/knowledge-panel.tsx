'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth/session';
import { ApiClientError, errorMessage } from '@/shared/api/client';
import { GeometryFigure, MathText } from '@/shared/ui/common';
import { questionsForNode, type GraphNode, type GraphStructure } from './graph-model';

export function KnowledgePanel({
  data,
  focus,
  select,
}: {
  data: GraphStructure;
  focus: GraphNode;
  select: (id: string) => void;
}) {
  const questions = questionsForNode(data, focus.id);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const { api, expire } = useSession();
  const router = useRouter();
  const question = questions[index];
  useLayoutEffect(() => {
    panel.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [index]);
  const children = data.nodes.filter((n) => n.parentId === focus.id);
  async function practice() {
    if (!question || question.readingOnly || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api.createPractice({ mode: 'EXPLICIT', questionIds: [question.id] });
      router.push('/practice/' + encodeURIComponent(result.id));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) expire();
      setError(errorMessage(error));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function change(next: number) {
    setIndex(next);
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
      {question ? (
        <>
          <label className="km-picker">
            选择关联题目
            <select
              aria-label="选择关联题目"
              value={index}
              disabled={busy}
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
              <span className="tag">{question.readingOnly ? '学习题目' : '练习题目'}</span>
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
                <MathText>{o.text}</MathText>
              </div>
            ))}
            {question.prompts?.map((p, i) => (
              <MathText key={p.id}>{'（' + (i + 1) + '）' + p.prompt}</MathText>
            ))}
            <div className="km-tags" aria-label="题目关联知识点">
              {question.knowledgeIds.map((id) => {
                const n = data.nodes.find((n) => n.kind === 'point' && n.code === id);
                return n ? (
                  <button key={id} onClick={() => select(n.id)} title={n.label}>
                    {n.label}
                  </button>
                ) : null;
              })}
            </div>
          </article>
          <div className="km-question-actions">
            <button
              className="btn small"
              disabled={index === 0 || busy}
              onClick={() => change(index - 1)}
            >
              上一题
            </button>
            <button
              className="btn small"
              disabled={index === questions.length - 1 || busy}
              onClick={() => change(index + 1)}
            >
              下一题
            </button>
            <button
              className="btn small primary"
              disabled={question.readingOnly || busy}
              onClick={() => void practice()}
            >
              {busy ? '正在创建…' : '练习此题'}
            </button>
          </div>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {question.readingOnly && (
            <p className="km-future-note">
              本题用于阅读学习，完成正式题库录入后开放作答与判题。
              {question.needsReview ? '本题内容仍在复核。' : ''}
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
