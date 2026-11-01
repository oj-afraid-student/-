'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Answer, Evaluation, PublicQuestion, SubmissionDetail } from '@/shared/contracts';
import { useSession } from '@/features/auth/session';
import { ApiClientError, errorMessage } from '@/shared/api/client';
import { useResource } from '@/shared/api/use-resource';
import {
  EmptyState,
  ErrorState,
  GradingBadge,
  LoadingState,
  MathText,
  PageHead,
} from '@/shared/ui/common';
import { Icon } from '@/shared/ui/icons';
import { QuestionContent } from './question-renderer';

const evaluations = {
  CORRECT: { label: '正确', className: 'green', icon: 'check' },
  INCORRECT: { label: '错误', className: 'red', icon: 'close' },
  PENDING_REVIEW: { label: '待复核', className: 'amber', icon: 'clock' },
};
export function ResultView({ id }: { id: string }) {
  const { api } = useSession();
  const loader = useCallback((signal: AbortSignal) => api.submission(id, signal), [api, id]);
  const state = useResource(loader);
  if (state.loading) return <LoadingState text="正在读取作答结果…" />;
  if (state.error) return <ErrorState message={state.error} retry={state.retry} />;
  return state.data ? <ResultContent key={id} result={state.data} /> : null;
}
function ResultContent({ result }: { result: SubmissionDetail }) {
  const { api, expire } = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState<'ALL' | Evaluation['status']>('ALL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const incorrect = result.items.filter((item) => item.evaluation.status === 'INCORRECT');
  async function retry(onlyIncorrect: boolean) {
    setBusy(true);
    setError('');
    try {
      const practice = await api.createPractice({
        mode: 'EXPLICIT',
        questionIds: (onlyIncorrect ? incorrect : result.items).map((item) => item.question.id),
      });
      router.push(`/practice/${encodeURIComponent(practice.id)}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) expire();
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const visible = result.items.filter(
    (item) => filter === 'ALL' || item.evaluation.status === filter,
  );
  return (
    <>
      <PageHead
        eyebrow="REFLECTION / 作答回顾"
        title="让每一步思考，都有回响"
        description={`提交于 ${new Date(result.submittedAt).toLocaleString('zh-CN', { hour12: false })} · 本次 ${result.totalCount} 题`}
        actions={
          <Link className="btn" href="/history">
            返回练习记录
          </Link>
        }
      />
      <section className="result-hero">
        <div>
          <GradingBadge status={result.gradingStatus} />
          <h2>{result.score === null ? '部分题目仍待复核' : '本次练习已完成评分'}</h2>
          <p>
            {result.score === null
              ? '已保存全部作答。需要推理过程或进一步核对的答案，不计为错误。'
              : '结合参考解析，回顾条件、方法与推理中的关键一步。'}
          </p>
        </div>
        <div className="result-score">
          {result.score === null ? (
            <>
              <strong className="pending-score">待复核</strong>
              <small>最终总分暂未形成</small>
            </>
          ) : (
            <>
              <strong>
                {result.score}
                <span> / {result.maxScore}</span>
              </strong>
              <small>本次得分</small>
            </>
          )}
        </div>
      </section>
      <div className="result-stats">
        <div className="panel">
          <span>题目总数</span>
          <strong>{result.totalCount}</strong>
        </div>
        <div className="panel">
          <span>已判题数</span>
          <strong>{result.gradedCount}</strong>
        </div>
        <div className="panel">
          <span>已判正确</span>
          <strong>{result.correctCount}</strong>
        </div>
        <div className="panel">
          <span>待复核</span>
          <strong>{result.pendingCount}</strong>
        </div>
      </div>
      {result.pendingCount > 0 && (
        <p className="notice amber">
          待复核题仅保存过程并提供参考解析；复核完成前不生成最终总分。你可以继续学习或另建练习。
        </p>
      )}
      <div className="result-toolbar">
        <div className="filter-tabs" aria-label="筛选题目">
          {(
            [
              { id: 'ALL', label: '全部', count: result.totalCount },
              ...Object.entries(evaluations).map(([id, value]) => ({
                id: id as Evaluation['status'],
                label: value.label,
                count: result.items.filter((item) => item.evaluation.status === id).length,
              })),
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              className={filter === tab.id ? 'active' : ''}
              onClick={() => setFilter(tab.id)}
              aria-pressed={filter === tab.id}
            >
              {tab.label}
              <span>{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="actions">
          <button
            className="btn small"
            onClick={() => void retry(true)}
            disabled={busy || !incorrect.length}
          >
            重练本次错题
          </button>
          <button className="btn small" onClick={() => void retry(false)} disabled={busy}>
            再练同一题组
          </button>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!visible.length && (
        <EmptyState title="此分类下没有题目">待复核题不会被归入错题。</EmptyState>
      )}
      <div className="result-items">
        {visible.map((item) => {
          const status = evaluations[item.evaluation.status];
          return (
            <article key={item.practiceItemId} className={`panel result-item ${status.className}`}>
              <div className="row between">
                <span className="eyebrow">第 {result.items.indexOf(item) + 1} 题</span>
                <span className={`tag ${status.className}`}>
                  <Icon name={status.icon} />
                  {status.label}
                </span>
              </div>
              <QuestionContent question={item.question} />
              <div className="answer-review">
                <div>
                  <h3>我的作答</h3>
                  <AnswerReview question={item.question} answer={item.answer} />
                </div>
                <div>
                  <h3>参考答案</h3>
                  <MathText>{item.reference.answerText}</MathText>
                </div>
              </div>
              <details className="reference-explanation" open>
                <summary>查看解析与依据</summary>
                <MathText>{item.reference.explanation}</MathText>
              </details>
            </article>
          );
        })}
      </div>
    </>
  );
}
function AnswerReview({ question, answer }: { question: PublicQuestion; answer: Answer }) {
  if (answer.type === 'SINGLE_CHOICE') return <MathText>{answer.selectedOptionId}</MathText>;
  if (answer.type === 'MULTIPLE_CHOICE')
    return <MathText>{answer.selectedOptionIds.join('、')}</MathText>;
  if (answer.type === 'FILL_BLANK')
    return (
      <div>
        {answer.blanks.map((blank) => (
          <p key={blank.blankId}>
            <b>
              {question.type === 'FILL_BLANK'
                ? question.blanks.find((entry) => entry.id === blank.blankId)?.label
                : blank.blankId}
              ：
            </b>
            {blank.values.join('；')}
          </p>
        ))}
      </div>
    );
  if (answer.type === 'JUDGMENT_REASON')
    return (
      <div>
        {answer.judgments.map((entry, index) => (
          <div key={entry.statementId} className="answer-part">
            <strong>
              判断 {index + 1}：{entry.value ? '正确' : '错误'}
            </strong>
            <MathText>{entry.reason}</MathText>
          </div>
        ))}
      </div>
    );
  return (
    <div>
      {answer.parts.map((part, index) => (
        <div key={part.partId} className="answer-part">
          <strong>第 {index + 1} 问</strong>
          <MathText>{part.text}</MathText>
        </div>
      ))}
    </div>
  );
}
