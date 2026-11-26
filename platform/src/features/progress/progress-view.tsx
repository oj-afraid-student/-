'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useSession } from '@/features/auth/session';
import { useResource } from '@/shared/api/use-resource';
import type { StudentProgress } from '@/shared/contracts';
import { EmptyState, ErrorState, LoadingState, PageHead } from '@/shared/ui/common';
import styles from './progress.module.css';

const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
const evidence = {
  NO_ATTEMPTS: { label: '未练习', style: 'tag' },
  INSUFFICIENT_EVIDENCE: { label: '证据不足', style: 'tag amber' },
  ENOUGH_EVIDENCE: { label: '样本达标', style: 'tag green' },
};

export function ProgressView() {
  const { api } = useSession();
  const loader = useCallback((signal: AbortSignal) => api.progress(signal), [api]);
  const state = useResource(loader);

  return (
    <>
      <PageHead
        title="学习画像"
        description="查看历次已提交练习的整体表现，以及各知识点的掌握情况。"
        actions={
          <Link className="btn" href="/history">
            查看练习记录
          </Link>
        }
      />
      {state.loading ? (
        <LoadingState text="正在读取学习画像…" />
      ) : state.error ? (
        <ErrorState message={state.error} retry={state.retry} />
      ) : (
        state.data && <ProgressDetails profile={state.data} />
      )}
    </>
  );
}

function ProgressDetails({ profile }: { profile: StudentProgress }) {
  const { overall, points, minimumGradedCount } = profile;
  const [unitFilter, setUnitFilter] = useState('');
  const units = new Map(points.map((point) => [point.unitId, point.unitTitle]));
  const visible = points
    .filter((point) => !unitFilter || (point.unitId ?? 'historical') === unitFilter)
    .sort((a, b) => Number(b.attemptCount > 0) - Number(a.attemptCount > 0));

  return (
    <>
      <section className="result-stats" aria-label="练习概览">
        <div className="panel">
          <span>已提交练习</span>
          <strong>{profile.submissionCount}</strong>
        </div>
        <div className="panel">
          <span>累计作答题次</span>
          <strong>{overall.attemptCount}</strong>
        </div>
        <div className="panel">
          <span>已判定题次</span>
          <strong>{overall.gradedCount}</strong>
        </div>
        <div className="panel">
          <span>整体正确率</span>
          <strong>{overall.accuracy === null ? '—' : percent.format(overall.accuracy)}</strong>
        </div>
      </section>
      {profile.submissionCount === 0 && (
        <EmptyState title="还没有提交记录">
          <p>完成一组练习后，这里会显示作答数据。</p>
          <Link className="btn" href="/practice/new">
            开始练习
          </Link>
        </EmptyState>
      )}
      {points.length > 0 && (
        <section aria-labelledby="knowledge-progress-title">
          <div className="section-head">
            <h2 id="knowledge-progress-title">知识点掌握情况</h2>
            <label className="field">
              知识单元
              <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
                <option value="">全部单元</option>
                {Array.from(units, ([id, title]) => (
                  <option key={id ?? 'historical'} value={id ?? 'historical'}>
                    {title ?? '历史知识标签'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="field-hint">
            正确率按已判定题次计算。每个知识点至少需要 {minimumGradedCount} 次判定才达到参考门槛。
          </p>
          <ul className={styles.points}>
            {visible.map((point) => {
              const status = evidence[point.status];
              return (
                <li key={point.id} className={`panel ${styles.point}`}>
                  <div className={styles.heading}>
                    <h3>{point.title}</h3>
                    <span className={status.style}>{status.label}</span>
                  </div>
                  <p className="muted small">{point.unitTitle ?? '历史知识标签'}</p>
                  <p className="small">
                    作答 {point.attemptCount} 次 · 已判 {point.gradedCount} 次 · 正确{' '}
                    {point.correctCount} 次
                  </p>
                  {point.accuracy !== null && (
                    <div className={styles.accuracy}>
                      <span>正确率 {percent.format(point.accuracy)}</span>
                      {point.status === 'ENOUGH_EVIDENCE' && (
                        <progress value={point.accuracy} max={1} aria-label="正确率" />
                      )}
                    </div>
                  )}
                  {point.latestSubmissionId && (
                    <Link
                      className="text-link"
                      href={`/results/${encodeURIComponent(point.latestSubmissionId)}`}
                    >
                      查看最近作答
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
