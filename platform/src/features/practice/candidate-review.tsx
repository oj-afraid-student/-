'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage, request } from '@/shared/api/client';
import { requestKnowledgeTags } from '@/shared/api/knowledge-tags';
import { useResource } from '@/shared/api/use-resource';
import { difficultyLabels, MathText, PageHead, questionTypeLabels } from '@/shared/ui/common';
import Image from 'next/image';
import { candidateDiagramPhoto, type CandidateDiagram } from '@/shared/candidate-diagram';
import { DiagramRedraw } from '@/shared/ui/diagram-redraw';

interface Candidate {
  revision?: { id: string; baseVersion: number };
  history?: { version: number; title: string; published: boolean }[];
  existingFigures?: { id: string; src: string; alt: string; caption?: string }[];
  diagram?: CandidateDiagram | null;
  photo?: string;
  originalPhoto?: string;
  origin?: 'UPLOAD' | 'AI_GENERATED';
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
interface SolutionDraft {
  status: 'SOLVED' | 'NEEDS_CLARIFICATION';
  answers: string[];
  explanation: string;
  questions: string[];
  snapshot: string;
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
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagReasons, setTagReasons] = useState<{ id: string; reason: string }[]>([]);
  const reviewForm = useRef<HTMLFormElement>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [solutionDraft, setSolutionDraft] = useState<SolutionDraft | null>(null);
  const [solutionError, setSolutionError] = useState('');
  const [editQuestionId, setEditQuestionId] = useState('');
  const [revisionLoad, setRevisionLoad] = useState(0);
  async function loadRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const loaded = await request<Candidate>(
        '/api/v1',
        '/ai/questions/' + encodeURIComponent(editQuestionId.trim().toUpperCase()),
      );
      setCandidate(loaded);
      setRevisionLoad((count) => count + 1);
      setTagIds(loaded.knowledgeIds);
      setTagReasons([]);
      setChecked(false);
      setPublished('');
      setSolutionDraft(null);
      setSolutionError('');
      requestId.current = null;
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const [solving, setSolving] = useState(false);
  const solutionPending = useRef<AbortController | null>(null);
  useEffect(() => () => solutionPending.current?.abort(), []);
  function solutionInput() {
    if (!candidate || !reviewForm.current) return null;
    const data = new FormData(reviewForm.current);
    const photo = candidate.originalPhoto ?? candidate.photo;
    return {
      stem: String(data.get('stem') ?? '').trim(),
      fields: String(data.get('fields') ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      type: candidate.type,
      ...(photo ? { photo } : {}),
    };
  }
  async function solve() {
    const input = solutionInput();
    if (!input || busy || solutionPending.current) return;
    if (!input.stem || !input.fields.length) {
      setSolutionError('请先填写题干和选项、空位或小问。');
      return;
    }
    const controller = new AbortController();
    solutionPending.current = controller;
    setBusy(true);
    setSolving(true);
    setSolutionError('');
    try {
      const result = await request<Omit<SolutionDraft, 'snapshot'>>(
        '/api/v1',
        '/ai/candidates/solution',
        {
          method: 'POST',
          body: input,
          signal: controller.signal,
          timeoutMs: 100000,
        },
      );
      if (!controller.signal.aborted)
        setSolutionDraft({ ...result, snapshot: JSON.stringify(input) });
    } catch (e) {
      if (!controller.signal.aborted) setSolutionError(errorMessage(e));
    } finally {
      solutionPending.current = null;
      if (!controller.signal.aborted) {
        setBusy(false);
        setSolving(false);
      }
    }
  }
  function applySolution() {
    if (!candidate || !solutionDraft || solutionDraft.status !== 'SOLVED') return;
    if (JSON.stringify(solutionInput()) !== solutionDraft.snapshot) {
      setSolutionError('题干、小问或原图已经改变，请按当前内容重新生成解答。');
      return;
    }
    setCandidate({
      ...candidate,
      answers: solutionDraft.answers,
      explanation: solutionDraft.explanation,
    });
    setChecked(false);
    requestId.current = null;
    setSolutionError('');
  }

  async function classify(stem: string, fields: string[]) {
    const result = await requestKnowledgeTags(stem, fields);
    setTagIds(result.tags.map((tag) => tag.id));
    setTagReasons(result.tags);
    setChecked(false);
  }
  useEffect(() => {
    let cancelled = false;
    // Import browser storage after hydration; Strict Mode's discarded mount must not consume it.
    queueMicrotask(() => {
      if (cancelled) return;
      const raw = sessionStorage.getItem('zhixu-upload-review');
      if (!raw) return;
      sessionStorage.removeItem('zhixu-upload-review');
      try {
        const problem = JSON.parse(raw);
        setCandidate({
          photo: problem.photo,
          origin: 'UPLOAD',
          originalPhoto: problem.originalPhoto ?? problem.photo,
          diagram: problem.editableDiagram,
          title: problem.title,
          stem: problem.text,
          fields: problem.questions,
          answers: problem.questions.map(() => ''),
          explanation: '',
          type: 'COMPREHENSIVE',
          difficulty: 'BASIC',
          status: 'PENDING_REVIEW',
          knowledgeIds: [],
          unitIds: [],
          scopePreview: false,
        });
        setBusy(true);
        classify(problem.text, problem.questions)
          .catch((e) => setError(errorMessage(e)))
          .finally(() => setBusy(false));
      } catch {
        setError('上传题目读取失败，请返回学习台重新确认。');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const fields = {
      knowledgeId: data.get('knowledgeId'),
      type: data.get('type'),
      difficulty: data.get('difficulty'),
      diagram: data.get('diagram') === 'on',
    };
    setBusy(true);
    setPublished('');
    setSolutionDraft(null);
    setSolutionError('');
    requestId.current = null;
    setChecked(false);
    setCandidate(undefined);
    setError('');
    try {
      const result = await request<Candidate>('/api/v1', '/ai/candidates', {
        method: 'POST',
        body: fields,
        timeoutMs: 100000,
      });
      setCandidate(result);
      if (result.diagram) setCandidate({ ...result, photo: candidateDiagramPhoto(result.diagram) });
      await classify(result.stem, result.fields);
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
      const result = await request<{ id: string; version?: number }>(
        '/api/v1',
        '/ai/candidates/publish',
        {
          method: 'POST',
          body: {
            requestId: id,
            confirmed: true,
            photo: candidate.photo,
            origin: candidate.origin ?? 'AI_GENERATED',
            ...(candidate.revision ? { revision: candidate.revision } : {}),
            knowledgeIds: tagIds,
            type: candidate.type,
            difficulty: fields.get('difficulty'),
            title: fields.get('title'),
            stem: fields.get('stem'),
            fields: lines('fields'),
            answers: lines('answers'),
            explanation: fields.get('explanation'),
          },
        },
      );
      setPublished(result.version ? `${result.id} 第${result.version}版` : result.id);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="自主练习"
        title="AI 候选练习"
        description="生成候选题后核对题干、答案、解析和知识标签。复核员可编辑并发布到题库。"
      />
      {permission.data?.allowed && (
        <form className="panel" onSubmit={loadRevision}>
          <h2>编辑已入库题目</h2>
          <label className="field">
            题号
            <input
              aria-label="要修订的题号"
              value={editQuestionId}
              onChange={(event) => setEditQuestionId(event.target.value)}
              required
              pattern="[Qq][0-9]+"
              placeholder="例如 Q1003"
              disabled={busy}
            />
          </label>
          <button className="btn" disabled={busy}>
            读取最新版本
          </button>
          <p className="field-hint">
            读取会替换当前编辑草稿。修改后重新复核并发布，新练习使用新版，历史练习保留原版。
          </p>
        </form>
      )}
      <form className="panel" onSubmit={generate}>
        {units.loading && <p role="status">正在加载知识目录…</p>}
        {units.error && (
          <button type="button" className="btn" onClick={units.retry}>
            重试读取知识目录
          </button>
        )}
        <label className="field">
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
        <label className="field">
          难度
          <select name="difficulty">
            {Object.entries(difficultyLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          题型
          <select name="type">
            {Object.entries(questionTypeLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input name="diagram" type="checkbox" /> 按需生成点线示意图（发布前需核对顶点和连线）
        </label>
        <button className="btn primary" disabled={busy || !units.data?.length}>
          {busy ? '正在生成与校验（截断时自动重试）…' : '生成候选练习'}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      {candidate && permission.data?.allowed && (
        <form
          key={
            candidate.revision
              ? `${candidate.revision.id}:${candidate.revision.baseVersion}:${revisionLoad}`
              : 'new'
          }
          ref={reviewForm}
          className="panel"
          onSubmit={publish}
        >
          <h2>在线复核与编辑</h2>
          {candidate.revision && (
            <div role="status">
              <h3>
                {candidate.revision.id} · 基于第{candidate.revision.baseVersion}版修订
              </h3>
              <p>编辑 → 核对题意、答案、解析、标签及配图 → 发布新版本。</p>
              <details>
                <summary>已有版本记录</summary>
                <ul>
                  {candidate.history?.map((version) => (
                    <li key={version.version}>
                      第{version.version}版 · {version.title} ·{' '}
                      {version.published ? '已发布' : '未发布'}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
          {!candidate.photo &&
            candidate.existingFigures?.map((figure) => (
              <Image
                key={figure.id}
                src={figure.src}
                alt={figure.alt}
                width={600}
                height={400}
                unoptimized
                style={{ objectFit: 'contain', maxWidth: '100%' }}
              />
            ))}
          {candidate.revision && candidate.answers.some((answer) => !answer.trim()) && (
            <p>旧数据未保存逐问答案，请按各小问补全后再发布；原参考解析已保留。</p>
          )}
          {candidate.photo && (
            <Image
              src={candidate.photo}
              alt="待复核的题目配图"
              width={600}
              height={400}
              unoptimized
              style={{ objectFit: 'contain', maxWidth: '100%' }}
            />
          )}
          {!published && (
            <DiagramRedraw
              key={candidate.stem}
              text={candidate.stem}
              photo={candidate.originalPhoto ?? candidate.photo}
              initial={candidate.diagram}
              disabled={busy}
              onBusyChange={setBusy}
              onApply={(diagram, photo) => {
                setCandidate({
                  ...candidate,
                  originalPhoto: candidate.originalPhoto ?? candidate.photo,
                  diagram,
                  photo,
                });
                setChecked(false);
                requestId.current = null;
              }}
              onRestore={
                candidate.originalPhoto
                  ? () => {
                      setCandidate({ ...candidate, photo: candidate.originalPhoto, diagram: null });
                      setChecked(false);
                      requestId.current = null;
                    }
                  : undefined
              }
            />
          )}
          {candidate.originalPhoto && candidate.originalPhoto !== candidate.photo && (
            <details>
              <summary>对照原照片</summary>
              <Image
                src={candidate.originalPhoto}
                alt="原题照片"
                width={600}
                height={400}
                unoptimized
                style={{ objectFit: 'contain', maxWidth: '100%' }}
              />
            </details>
          )}
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
              <textarea
                name="stem"
                required
                maxLength={1800}
                defaultValue={candidate.stem}
                onChange={(event) => setCandidate({ ...candidate, stem: event.target.value })}
              />
            </label>
            <label className="field">
              选项、空位或小问（选择题按 A、B、C、D 顺序，每行一个选项内容）
              <textarea
                name="fields"
                required
                rows={5}
                defaultValue={candidate.fields.join('\n')}
              />
            </label>
            <label className="field">
              参考答案（选择题每行填写一个大写字母，如 A、C）
              <textarea
                name="answers"
                required
                value={candidate.answers.join('\n')}
                onChange={(event) =>
                  setCandidate({ ...candidate, answers: event.target.value.split('\n') })
                }
              />
            </label>
            <label className="field">
              解析
              <textarea
                name="explanation"
                required
                maxLength={2200}
                value={candidate.explanation}
                onChange={(event) =>
                  setCandidate({ ...candidate, explanation: event.target.value })
                }
              />
            </label>
            {!published && (
              <section className="panel" aria-label="AI参考答案与解析">
                <button type="button" className="btn" disabled={busy} onClick={() => void solve()}>
                  {solving ? '正在求解与核对…' : 'AI生成参考答案与解析'}
                </button>
                <p className="field-hint">
                  按当前题干、小问和原照片独立求解。先预览草稿，填入后仍可修改并需人工复核。
                </p>
                {solutionError && <p role="alert">{solutionError}</p>}
                {solutionDraft && (
                  <details open>
                    <summary>AI解答草稿（待复核）</summary>
                    {solutionDraft.status === 'SOLVED' ? (
                      <>
                        <h3>参考答案草稿</h3>
                        {solutionDraft.answers.map((answer, index) => (
                          <p key={index}>
                            <MathText>{`${candidate.type.includes('CHOICE') ? '' : `（${index + 1}）`}${answer}`}</MathText>
                          </p>
                        ))}
                        <h3>解析草稿</h3>
                        <MathText>{solutionDraft.explanation}</MathText>
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={applySolution}
                        >
                          将草稿填入答案与解析
                        </button>
                        <p className="field-hint">
                          此操作将替换编辑框中的答案与解析，并清除入库确认勾选。
                        </p>
                      </>
                    ) : (
                      <>
                        <p>需先核对条件，暂未生成答案。</p>
                        <MathText>{solutionDraft.explanation}</MathText>
                        {solutionDraft.questions.map((question, index) => (
                          <p key={index}>{question}</p>
                        ))}
                      </>
                    )}
                  </details>
                )}
              </section>
            )}
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
                multiple
                value={tagIds}
                onChange={(event) =>
                  setTagIds(Array.from(event.target.selectedOptions, (option) => option.value))
                }
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
          {!published && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                if (!reviewForm.current) return;
                const data = new FormData(reviewForm.current);
                setBusy(true);
                setError('');
                try {
                  await classify(String(data.get('stem')), String(data.get('fields')).split('\n'));
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              按修改后的题目重新标注
            </button>
          )}
          {tagReasons.map((tag) => (
            <p key={tag.id}>
              {tag.id}：{tag.reason}
            </p>
          ))}
          <p>可多选并修改标签，确认后按所选标签发布。没有匹配时请人工选择。</p>
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
              {busy ? '正在发布…' : candidate.revision ? '复核并发布新版本' : '确认并导入题库'}
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
          <MathText>{candidate.stem}</MathText>
          <ol
            className="candidate-preview-fields"
            style={{ listStyleType: candidate.type.includes('CHOICE') ? 'upper-alpha' : 'decimal' }}
          >
            {candidate.fields.map((field, index) => (
              <li key={index}>
                <MathText displayFractions>{field}</MathText>
              </li>
            ))}
          </ol>
          <h3>参考答案</h3>
          <MathText>{candidate.answers.join('；')}</MathText>
          <h3>参考解析</h3>
          <MathText>{candidate.explanation}</MathText>
          <p role="status">
            {permission.loading
              ? '正在检查入库权限…'
              : permission.error
                ? '入库权限读取失败，请重试。'
                : '当前账号尚未开通题库复核权限，请联系维护者配置。'}
          </p>
          <button type="button" className="btn" onClick={permission.retry}>
            刷新入库权限
          </button>
        </section>
      )}
    </>
  );
}
