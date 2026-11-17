'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import { errorMessage, request } from '@/shared/api/client';
import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/timeouts';
import { useResource } from '@/shared/api/use-resource';
import { difficultyLabels, PageHead, questionTypeLabels } from '@/shared/ui/common';

interface Candidate {
  title: string;
  stem: string;
  fields: string[];
  answers: string[];
  explanation: string;
  knowledgeIds: string[];
  unitIds: string[];
  difficulty: string;
  type: string;
  status: 'PENDING_REVIEW';
  scopePreview: boolean;
}

export function CandidateReview() {
  const load = useCallback(
    (signal: AbortSignal) =>
      request<
        { id: string; title: string; points: { id: string; title: string; preview: boolean }[] }[]
      >('/api/v1', '/ai/candidates', { signal }),
    [],
  );
  const units = useResource(load);
  const loadPermission = useCallback(
    (signal: AbortSignal) =>
      request<{ allowed: boolean; userId: string }>('/api/v1', '/ai/candidates/publish', {
        signal,
      }),
    [],
  );
  const permission = useResource(loadPermission);
  const requestId = useRef<string | null>(null);
  const [published, setPublished] = useState('');
  const [candidate, setCandidate] = useState<Candidate>();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setPublished('');
    requestId.current = null;
    setChecked(false);
    setCandidate(undefined);
    setError('');
    try {
      setCandidate(
        await request<Candidate>('/api/v1', '/ai/candidates', {
          method: 'POST',
          body: fields,
          timeoutMs: AI_REQUEST_TIMEOUT_MS,
        }),
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!candidate || !checked || busy || published) return;
    const fields = new FormData(event.currentTarget);
    const lines = (name: string) =>
      String(fields.get(name) ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const id = (requestId.current ??= crypto.randomUUID());
    setBusy(true);
    setError('');
    try {
      const result = await request<{ id: string }>('/api/v1', '/ai/candidates/publish', {
        method: 'POST',
        body: {
          requestId: id,
          confirmed: true,
          knowledgeId: fields.get('knowledgeId'),
          type: candidate.type,
          difficulty: fields.get('difficulty'),
          title: fields.get('title'),
          stem: fields.get('stem'),
          fields: lines('fields'),
          answers: lines('answers'),
          explanation: fields.get('explanation'),
        },
      });
      setPublished(result.id);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function exportCandidate() {
    if (!candidate || !checked) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(candidate, null, 2)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'zhixu-candidate.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <PageHead
        eyebrow="自主练习"
        title="AI 候选练习"
        description="生成候选题后核对题干、答案、解析和知识标签。复核员可编辑并发布到题库。"
      />
      <form className="panel" onSubmit={generate}>
        {units.loading && <p role="status">正在加载知识目录…</p>}
        {units.error && (
          <button type="button" className="btn" onClick={units.retry}>
            重试读取知识目录
          </button>
        )}
        <label>
          细分知识点
          <select name="knowledgeId" required defaultValue="">
            <option value="" disabled>
              选择知识点
            </option>
            {units.data?.map((unit) => (
              <optgroup key={unit.id} label={unit.title}>
                {unit.points.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.title}（{point.id}）{point.preview ? ' · 扩充预览' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          难度
          <select name="difficulty">
            {Object.entries(difficultyLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          题型
          <select name="type">
            {Object.entries(questionTypeLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" disabled={busy || !units.data?.length}>
          {busy ? '正在生成…' : '生成候选练习'}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      {candidate && permission.data?.allowed && (
        <form className="panel" onSubmit={publish}>
          <h2>在线复核与编辑</h2>
          <fieldset
            disabled={busy || !!published}
            className="answer-fieldset"
            onChange={() => setChecked(false)}
          >
            <legend>
              {questionTypeLabels[candidate.type as keyof typeof questionTypeLabels]} ·
              每行填写一个选项或小问
            </legend>
            <label className="field">
              标题
              <input name="title" required maxLength={120} defaultValue={candidate.title} />
            </label>
            <label className="field">
              题干
              <textarea name="stem" required maxLength={1800} defaultValue={candidate.stem} />
            </label>
            <label className="field">
              选项、空位或小问
              <textarea
                name="fields"
                required
                rows={5}
                defaultValue={candidate.fields.join('\n')}
              />
            </label>
            <label className="field">
              参考答案（选择题每行填一个从 1 开始的选项序号）
              <textarea name="answers" required defaultValue={candidate.answers.join('\n')} />
            </label>
            <label className="field">
              解析
              <textarea
                name="explanation"
                required
                maxLength={2200}
                defaultValue={candidate.explanation}
              />
            </label>
            <label className="field">
              难度
              <select name="difficulty" defaultValue={candidate.difficulty}>
                {Object.entries(difficultyLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              知识点
              <select
                name="knowledgeId"
                required
                defaultValue={candidate.scopePreview ? '' : candidate.knowledgeIds[0]}
              >
                <option value="" disabled>
                  选择正式知识点
                </option>
                {units.data?.flatMap((unit) =>
                  unit.points
                    .filter((point) => !point.preview)
                    .map((point) => (
                      <option key={point.id} value={point.id}>
                        {unit.title} · {point.title}（{point.id}）
                      </option>
                    )),
                )}
              </select>
            </label>
          </fieldset>
          {candidate.scopePreview && (
            <p>
              原标签 {candidate.knowledgeIds[0]}{' '}
              尚未正式入库。请等该知识点发布，或改选确实匹配的正式知识点。
            </p>
          )}
          {!published && (
            <label>
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={(event) => setChecked(event.target.checked)}
              />{' '}
              已确认题意、答案、解析和知识点正确
            </label>
          )}
          {!published && (
            <button className="btn primary" disabled={!checked || busy}>
              {busy ? '正在发布…' : '确认并导入题库'}
            </button>
          )}
          {published && <p role="status">已发布题目 {published}。可在自主练习中按题号查找。</p>}
        </form>
      )}
      {candidate && !permission.data?.allowed && (
        <section className="panel">
          <h2>{candidate.title}</h2>
          <p>
            待复核 · {candidate.knowledgeIds.join('、')}
            {candidate.scopePreview ? ' · 扩充目录预览' : ''}
          </p>
          <p>{candidate.stem}</p>
          <ol>
            {candidate.fields.map((field, index) => (
              <li key={index}>
                {index + 1}. {field}
              </li>
            ))}
          </ol>
          <h3>参考答案</h3>
          <p>{candidate.answers.join('；')}</p>
          <h3>参考解析</h3>
          <p>{candidate.explanation}</p>
          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            已核对题目、答案、解析和标签
          </label>
          <button type="button" className="btn" disabled={!checked} onClick={exportCandidate}>
            下载候选题供正式审核
          </button>
        </section>
      )}
    </>
  );
}
