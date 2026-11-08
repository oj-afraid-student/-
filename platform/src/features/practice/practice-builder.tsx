'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth/session';
import type { CreatePracticeRequest, Difficulty, QuestionType } from '@/shared/contracts';
import { ApiClientError, errorMessage } from '@/shared/api/client';
import { useResource } from '@/shared/api/use-resource';
import { difficultyLabels, PageHead, questionTypeLabels } from '@/shared/ui/common';
import { GeometryArt, Icon } from '@/shared/ui/icons';

export function PracticeBuilder({ initialUnit = '' }: { initialUnit?: string }) {
  const { api, expire } = useSession();
  const router = useRouter();
  const loader = useCallback((signal: AbortSignal) => api.knowledgePoints(signal), [api]);
  const state = useResource(loader);
  const [mode, setMode] = useState<'ALL' | 'FILTERED' | 'EXPLICIT'>(
    initialUnit ? 'FILTERED' : 'ALL',
  );
  const [unit, setUnit] = useState(initialUnit);
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [types, setTypes] = useState<QuestionType[]>([]);
  const [count, setCount] = useState('');
  const [ids, setIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const creating = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating.current) return;
    setError('');
    let selection: CreatePracticeRequest = { mode: 'ALL' };
    if (mode === 'FILTERED') {
      if (count && (!/^\d+$/.test(count) || +count < 1 || +count > 100)) {
        setError('题量需为 1—100 的整数，或留空选择全部匹配题。');
        return;
      }
      selection = {
        mode: 'FILTERED',
        ...(unit ? { knowledgePointId: unit } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(types.length ? { questionTypes: types } : {}),
        ...(count ? { count: +count } : {}),
      };
    } else if (mode === 'EXPLICIT') {
      const questionIds = ids
        .toUpperCase()
        .split(/[\s,，、;；]+/)
        .filter(Boolean);
      if (
        !questionIds.length ||
        questionIds.length > 100 ||
        new Set(questionIds).size !== questionIds.length ||
        questionIds.some((id) => !/^Q\d{2,}$/.test(id))
      ) {
        setError('请输入 1—100 个不重复题号，例如 Q02、Q06、Q14、Q24。');
        return;
      }
      selection = { mode: 'EXPLICIT', questionIds };
    }
    creating.current = true;
    setBusy(true);
    try {
      const practice = await api.createPractice(selection);
      router.push(`/practice/${encodeURIComponent(practice.id)}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) expire();
      setError(errorMessage(error));
    } finally {
      creating.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="PRACTICE / 自主练习"
        title="把理解，写成自己的答案"
        description="选择学习范围与题型，按自己的节奏完成一组练习。"
      />
      <div className="builder-layout">
        <section className="panel">
          <h2>创建练习</h2>
          {state.loading && (
            <p className="field-hint" role="status">
              正在读取单元目录，仍可先选择全部题目或指定题号。
            </p>
          )}
          {state.error && (
            <div className="notice amber" role="status">
              <p>暂时无法读取单元目录，仍可练习全部题目、按题型或难度筛选，或指定题号。</p>
              <button type="button" className="btn small" onClick={state.retry}>
                重试读取单元目录
              </button>
            </div>
          )}
          <form onSubmit={submit} aria-busy={busy}>
            <fieldset className="answer-fieldset" disabled={busy}>
              <legend>选择题组方式</legend>
              <div className="builder-modes">
                {(
                  [
                    { id: 'ALL', title: '全部题目', description: '按题号顺序完成当前题库' },
                    { id: 'FILTERED', title: '按条件选题', description: '选择单元、难度或题型' },
                    { id: 'EXPLICIT', title: '指定题号', description: '按输入顺序组成题组' },
                  ] as const
                ).map((option) => (
                  <label
                    className={`mode-card ${mode === option.id ? 'selected' : ''}`}
                    key={option.id}
                  >
                    <input
                      type="radio"
                      name="selection-mode"
                      value={option.id}
                      checked={mode === option.id}
                      onChange={() => setMode(option.id)}
                    />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>
              {mode === 'ALL' && (
                <p className="notice">
                  选择当前题库中的全部题目，含选择、填空、判断说明和推理过程等题型。题量以创建后的题组为准。
                </p>
              )}
              {mode === 'FILTERED' && (
                <div className="filter-fields">
                  <div className="grid-two">
                    <label className="field">
                      <span>学习单元</span>
                      <select
                        disabled={!state.data}
                        value={unit}
                        onChange={(event) => setUnit(event.target.value)}
                      >
                        <option value="">{state.data ? '全部单元' : '单元目录暂不可用'}</option>
                        {unit && !state.data?.some((entry) => entry.id === unit) && (
                          <option value={unit}>当前单元（{unit}）</option>
                        )}
                        {state.data?.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>难度</span>
                      <select
                        value={difficulty}
                        onChange={(event) => setDifficulty(event.target.value as Difficulty | '')}
                      >
                        <option value="">全部难度</option>
                        {Object.entries(difficultyLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <fieldset className="answer-fieldset">
                    <legend>题型（可多选，留空表示全部）</legend>
                    <div className="type-filters">
                      {(Object.keys(questionTypeLabels) as QuestionType[]).map((type) => (
                        <label className="option-pill" key={type}>
                          <input
                            type="checkbox"
                            checked={types.includes(type)}
                            onChange={() =>
                              setTypes((current) =>
                                current.includes(type)
                                  ? current.filter((value) => value !== type)
                                  : [...current, type],
                              )
                            }
                          />
                          {questionTypeLabels[type]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="field">
                    <span>题量（可选）</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={count}
                      onChange={(event) => setCount(event.target.value)}
                      placeholder="留空选择全部匹配题"
                    />
                  </label>
                  <p className="field-hint">
                    按题号取前 N 题，不随机抽题。条件无匹配或题量不足时会提示。
                  </p>
                </div>
              )}
              {mode === 'EXPLICIT' && (
                <label className="field">
                  <span>题号</span>
                  <textarea
                    aria-label="题号"
                    value={ids}
                    onChange={(event) => setIds(event.target.value)}
                    placeholder="Q02、Q06、Q14、Q24"
                    rows={3}
                  />
                  <small>用逗号或空格分隔，保持输入顺序。</small>
                </label>
              )}
            </fieldset>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className="builder-footer">
              <p className="muted small">每次创建都会生成新的练习，已有结果会保留。</p>
              <button className="btn primary" disabled={busy} type="submit">
                {busy ? '正在创建…' : '创建并开始练习'}
                <Icon name="arrow" />
              </button>
            </div>
          </form>
        </section>
        <aside className="panel soft builder-aside">
          <GeometryArt />
          <h2>完整记录你的思路</h2>
          <ol>
            <li>先独立阅读题目与条件</li>
            <li>填写每个空和每一问</li>
            <li>统一提交后回顾参考解析</li>
          </ol>
          <p>需要推理过程的题目进入复核。待复核期间保留作答，不计算最终总成绩。</p>
        </aside>
      </div>
    </>
  );
}
