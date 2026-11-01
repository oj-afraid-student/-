'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useSession } from '@/features/auth/session';
import { useResource } from '@/shared/api/use-resource';
import { EmptyState, ErrorState, GradingBadge, LoadingState, PageHead } from '@/shared/ui/common';
import { Icon } from '@/shared/ui/icons';

export function HistoryView() {
  const { api } = useSession();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const loader = useCallback(
    (signal: AbortSignal) => api.history({ page, pageSize }, signal),
    [api, page],
  );
  const state = useResource(loader);
  return (
    <>
      <PageHead
        eyebrow="HISTORY / 练习记录"
        title="每一次思考，都值得回顾"
        description="这里只记录已提交的练习。打开详情，查看自己的作答与参考解析。"
        actions={
          <Link className="btn primary" href="/practice/new">
            开始新练习
            <Icon name="arrow" />
          </Link>
        }
      />
      {state.loading ? (
        <LoadingState />
      ) : state.error ? (
        <ErrorState message={state.error} retry={state.retry} />
      ) : (
        state.data && (
          <>
            <div className="section-head">
              <h2>我的提交</h2>
              <span className="muted small">共 {state.data.total} 条记录</span>
            </div>
            {!state.data.items.length ? (
              <EmptyState title={state.data.total === 0 ? '还没有提交记录' : '这一页没有记录'}>
                {state.data.total === 0 ? (
                  <>
                    <p>完成一组练习后，可以在这里重新查看。</p>
                    <Link className="btn" href="/practice/new">
                      开始第一组练习
                    </Link>
                  </>
                ) : (
                  <button className="btn" onClick={() => setPage(1)}>
                    返回第一页
                  </button>
                )}
              </EmptyState>
            ) : (
              <div className="panel history-panel">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">练习与时间</th>
                        <th scope="col">题数</th>
                        <th scope="col">已判正确 / 已判</th>
                        <th scope="col">待复核</th>
                        <th scope="col">总成绩</th>
                        <th scope="col">状态</th>
                        <th scope="col">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.data.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>立体几何练习</strong>
                            <small>
                              {new Date(item.submittedAt).toLocaleString('zh-CN', {
                                hour12: false,
                              })}
                            </small>
                          </td>
                          <td>{item.totalCount} 题</td>
                          <td>
                            {item.correctCount} / {item.gradedCount}
                          </td>
                          <td>{item.pendingCount} 题</td>
                          <td>
                            {item.score === null ? '待复核' : `${item.score} / ${item.maxScore}`}
                          </td>
                          <td>
                            <GradingBadge status={item.gradingStatus} />
                          </td>
                          <td>
                            <Link
                              className="text-link"
                              aria-label={`查看 ${new Date(item.submittedAt).toLocaleString('zh-CN')} 的练习结果`}
                              href={`/results/${encodeURIComponent(item.id)}`}
                            >
                              查看详情
                              <Icon name="arrow" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <nav className="pagination" aria-label="历史分页">
              <button className="btn small" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                上一页
              </button>
              <span>
                第 {state.data.page} 页 / 共 {Math.max(1, Math.ceil(state.data.total / pageSize))}{' '}
                页
              </span>
              <button
                className="btn small"
                onClick={() => setPage(page + 1)}
                disabled={page * pageSize >= state.data.total}
              >
                下一页
              </button>
            </nav>
          </>
        )
      )}
    </>
  );
}
