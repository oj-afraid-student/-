'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '@/features/auth/session';
import { ApiClientError, errorMessage, request } from '@/shared/api/client';
import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/timeouts';
import {
  GRAPH_CHAT_HISTORY_LIMIT,
  GRAPH_CHAT_QUESTION_LIMIT,
  type GraphChatReply,
  type GraphChatTarget,
} from '@/shared/graph-chat-contract';
import { MathText } from '@/shared/ui/common';
import type { GraphNode, GraphQuestion } from './graph-model';

export function KnowledgeChat({ focus, question }: { focus: GraphNode; question?: GraphQuestion }) {
  const [scope, setScope] = useState<GraphChatTarget['kind']>('node');
  const selectedQuestion = scope === 'question' ? question : undefined;
  const target: GraphChatTarget = selectedQuestion
    ? { kind: 'question', id: selectedQuestion.id, version: selectedQuestion.version }
    : { kind: 'node', id: focus.id };
  const contextKey = selectedQuestion
    ? `question:${selectedQuestion.id}:${selectedQuestion.version}`
    : `node:${focus.id}`;

  return (
    <section className="km-chat" aria-label="AI 学习助手">
      <header>
        <h2>
          <span aria-hidden="true">✧</span> AI 学习助手
        </h2>
      </header>
      <div className="km-chat-context" role="group" aria-label="提问对象">
        <button
          type="button"
          aria-pressed={target.kind === 'node'}
          onClick={() => setScope('node')}
        >
          当前知识点
        </button>
        <button
          type="button"
          aria-pressed={target.kind === 'question'}
          onClick={() => setScope('question')}
          disabled={!question}
        >
          当前题目
        </button>
      </div>
      <ChatConversation
        key={contextKey}
        target={target}
        title={
          selectedQuestion ? `${selectedQuestion.id} · ${selectedQuestion.title}` : focus.label
        }
      />
    </section>
  );
}

function ChatConversation({ target, title }: { target: GraphChatTarget; title: string }) {
  const { expire } = useSession();
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<{ question: string; answer: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || activeRequest.current) return;

    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError('');
    try {
      const { answer } = await request<GraphChatReply>('/api/v1', '/ai/knowledge-map', {
        method: 'POST',
        body: { target, question, history: turns.slice(-GRAPH_CHAT_HISTORY_LIMIT) },
        signal: controller.signal,
        timeoutMs: AI_REQUEST_TIMEOUT_MS,
      });
      if (controller.signal.aborted) return;
      setTurns((previous) => [...previous, { question, answer }]);
      setDraft('');
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.status === 401) expire();
      setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <>
      <p className="km-chat-target">
        正在讨论 · <strong>{title}</strong>
      </p>
      {turns.length > 0 && (
        <div className="km-chat-log" role="log" aria-label="问答记录" tabIndex={0} ref={log}>
          {turns.map(({ question, answer }, index) => (
            <div className="km-chat-turn" key={index}>
              <p className="km-chat-question">{question}</p>
              <MathText allowLinksAndImages={false}>{answer}</MathText>
            </div>
          ))}
        </div>
      )}
      <form className="km-chat-input" onSubmit={send}>
        <textarea
          aria-label="AI 提问"
          placeholder="输入你的问题…"
          maxLength={GRAPH_CHAT_QUESTION_LIMIT}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" aria-label="发送问题" disabled={!draft.trim() || busy}>
          ↑
        </button>
      </form>
      {busy && <small role="status">正在生成回答…</small>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
