'use client';
import { useEffect, useRef, useState } from 'react';
import { request, errorMessage } from '@/shared/api/client';
import {
  candidateDiagramPhoto,
  candidateDiagramSchema,
  type CandidateDiagram,
} from '@/shared/candidate-diagram';
import './diagram-redraw.css';
import {
  constrainedSolid,
  DEFAULT_DIAGRAM_VIEW,
  midpointRules,
  prepareConstrainedDiagram,
  unsupportedSpatialReason,
  type DiagramView,
} from '@/shared/diagram-constraints';

export function DiagramRedraw({
  text,
  photo,
  initial,
  disabled = false,
  onApply,
  onRestore,
  onBusyChange,
}: {
  text: string;
  photo?: string;
  initial?: CandidateDiagram | null;
  disabled?: boolean;
  onApply: (diagram: CandidateDiagram, photo: string) => void;
  onRestore?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [view, setView] = useState<DiagramView>(initial?.view ?? DEFAULT_DIAGRAM_VIEW);
  const [draft, setDraft] = useState<CandidateDiagram | null>(() => {
    try {
      return initial ? prepareConstrainedDiagram(initial, text) : null;
    } catch {
      return initial ?? null;
    }
  });
  const { model, error: modelError } = constrainedSolid(text);
  const midpointConstraints = midpointRules(text);
  const unsupported = modelError || unsupportedSpatialReason(text);
  const protectedPoint = (id: string) =>
    !!model || midpointConstraints.some((r) => [r.point, r.a, r.b].includes(id));
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function edit(next: CandidateDiagram, nextView = view) {
    try {
      setDraft(prepareConstrainedDiagram(next, text, nextView));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
    setChecked(false);
    setApplied(false);
  }
  async function generate() {
    if (controller.current) return;
    const pending = new AbortController();
    controller.current = pending;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    setApplied(false);
    setChecked(false);
    try {
      const result = await request<{ diagram: CandidateDiagram | null; uncertainties: string[] }>(
        '/api/v1',
        '/ai/diagram/redraw',
        {
          method: 'POST',
          body: { text, ...(photo ? { photo } : {}) },
          signal: pending.signal,
          timeoutMs: 80000,
        },
      );
      if (result.diagram) edit(candidateDiagramSchema.parse(result.diagram));
      else setError('暂不能可靠重绘，可保留照片或手动绘图。');
      setNotes(result.uncertainties);
    } catch (e) {
      if (!pending.signal.aborted) setError(errorMessage(e));
    } finally {
      controller.current = null;
      if (!pending.signal.aborted) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }
  function apply() {
    if (!draft) return;
    if (unsupported) {
      setError(unsupported);
      return;
    }
    let constrained: CandidateDiagram;
    try {
      constrained = prepareConstrainedDiagram(draft, text, view);
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    const result = candidateDiagramSchema.safeParse(constrained);
    if (!result.success) {
      setError('请检查：至少3个点、2条线，点名唯一，连线端点存在，坐标在画布范围内。');
      return;
    }
    try {
      onApply(result.data, candidateDiagramPhoto(result.data));
      setApplied(true);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const locked = disabled || busy;
  return (
    <section className="diagram-redraw">
      <h3>原题图重绘</h3>
      <p className="field-hint">
        调整图像时自动保持已识别的约束。空间长度和角度在三维模型中校验，屏幕投影不按实际比例测量。
      </p>
      {unsupported && <p role="alert">{unsupported}</p>}
      {model && (
        <div role="status">
          <strong>已锁定三维几何约束</strong>
          <ul>
            {model.conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
          <p>
            这些条件确定了几何体形状。请调整下方视角改变顶点在画面中的位置，不能单独移动或删除受约束顶点。
          </p>
        </div>
      )}
      {!model && midpointConstraints.length > 0 && (
        <p>
          自动联动：{midpointConstraints.map((r) => `${r.point}=(${r.a}+${r.b})/2`).join('；')}
          。中点随端点移动，不能单独偏离所在边。
        </p>
      )}
      <div className="diagram-actions">
        <button
          type="button"
          className="btn"
          disabled={locked || !text.trim()}
          onClick={() => void generate()}
        >
          {busy ? '正在重绘原题图…' : '根据原题重绘配图'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={locked}
          onClick={() => {
            edit({
              points: [
                { id: 'A', x: 100, y: 300 },
                { id: 'B', x: 500, y: 300 },
                { id: 'C', x: 300, y: 80 },
              ],
              edges: [
                { from: 'A', to: 'B', dashed: false },
                { from: 'A', to: 'C', dashed: false },
              ],
            });
            setNotes([]);
          }}
        >
          新建手动点线图
        </button>
        {onRestore && (
          <button
            type="button"
            className="btn"
            disabled={locked}
            onClick={() => {
              onRestore();
              setApplied(false);
              setChecked(false);
            }}
          >
            恢复使用原照片
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {notes.map((note, i) => (
        <p key={i} className="field-hint">
          待核对：{note}
        </p>
      ))}
      {draft && (
        <>
          <svg
            viewBox="0 0 600 400"
            role="img"
            aria-label="待核对的重绘题图"
            className="diagram-preview"
          >
            <rect width="600" height="400" fill="white" />
            {draft.edges.map((edge, i) => {
              const a = draft.points.find((p) => p.id === edge.from),
                b = draft.points.find((p) => p.id === edge.to);
              return a && b ? (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#263f3b"
                  strokeWidth="1.5"
                  strokeDasharray={edge.dashed ? '5 5' : undefined}
                />
              ) : null;
            })}
            {draft.points.map((point, i) => (
              <g key={i}>
                <circle cx={point.x} cy={point.y} r="2" fill="#263f3b" />
                <text x={point.x + 5} y={point.y - 6} fill="#263f3b" fontSize="16">
                  {point.id}
                </text>
              </g>
            ))}
            {draft.labels?.map((label, i) => (
              <text key={i} x={label.x} y={label.y} fill="#263f3b" fontSize="16">
                {label.text}
              </text>
            ))}
          </svg>
          {model && (
            <fieldset disabled={locked} className="answer-fieldset diagram-view-controls">
              <legend>保持题目约束，调整图像视角</legend>
              {(
                [
                  { key: 'yaw', label: '水平旋转', min: -80, max: 80, step: 1 },
                  { key: 'pitch', label: '俯仰角', min: 10, max: 70, step: 1 },
                  { key: 'zoom', label: '图像大小', min: 0.5, max: 1, step: 0.01 },
                ] as const
              ).map((control) => (
                <label className="field" key={control.key}>
                  {control.label}
                  <input
                    type="range"
                    aria-label={control.label}
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={view[control.key]}
                    onChange={(event) => {
                      const next = { ...view, [control.key]: Number(event.target.value) };
                      setView(next);
                      edit(draft, next);
                    }}
                  />
                </label>
              ))}
            </fieldset>
          )}
          <fieldset disabled={locked} className="answer-fieldset">
            <legend>编辑点、连线和标注（X：30–570，Y：30–370）</legend>
            <details>
              <summary>顶点与位置</summary>
              {draft.points.map((point, index) => (
                <div className="diagram-edit-row" key={index}>
                  <label>
                    点名
                    <input
                      aria-label={`顶点${index + 1}名称`}
                      disabled={protectedPoint(point.id)}
                      value={point.id}
                      maxLength={2}
                      onChange={(e) => {
                        const id = e.target.value.toUpperCase();
                        edit({
                          ...draft,
                          points: draft.points.map((p, i) => (i === index ? { ...p, id } : p)),
                          edges: draft.edges.map((edge) => ({
                            ...edge,
                            from: edge.from === point.id ? id : edge.from,
                            to: edge.to === point.id ? id : edge.to,
                          })),
                        });
                      }}
                    />
                  </label>
                  {(['x', 'y'] as const).map((axis) => (
                    <label key={axis}>
                      {axis.toUpperCase()}
                      <input
                        type="number"
                        aria-label={`${point.id}点${axis.toUpperCase()}坐标`}
                        disabled={!!model || midpointConstraints.some((r) => r.point === point.id)}
                        min="30"
                        max={axis === 'x' ? 570 : 370}
                        value={point[axis]}
                        onChange={(e) =>
                          edit({
                            ...draft,
                            points: draft.points.map((p, i) =>
                              i === index ? { ...p, [axis]: Number(e.target.value) } : p,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="btn"
                    disabled={protectedPoint(point.id)}
                    onClick={() =>
                      edit({
                        ...draft,
                        points: draft.points.filter((_, i) => i !== index),
                        edges: draft.edges.filter(
                          (edge) => edge.from !== point.id && edge.to !== point.id,
                        ),
                      })
                    }
                  >
                    删除点
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn"
                disabled={!!model || draft.points.length >= 12}
                onClick={() => {
                  const id = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                    .split('')
                    .find((id) => !draft.points.some((p) => p.id === id));
                  if (id) edit({ ...draft, points: [...draft.points, { id, x: 300, y: 200 }] });
                }}
              >
                添加点
              </button>
            </details>
            <details>
              <summary>连线与实虚线</summary>
              {draft.edges.map((edge, index) => (
                <div className="diagram-edit-row" key={index}>
                  {(['from', 'to'] as const).map((end) => (
                    <label key={end}>
                      {end === 'from' ? '起点' : '终点'}
                      <select
                        value={edge[end]}
                        onChange={(e) =>
                          edit({
                            ...draft,
                            edges: draft.edges.map((line, i) =>
                              i === index ? { ...line, [end]: e.target.value } : line,
                            ),
                          })
                        }
                      >
                        {draft.points.map((p, i) => (
                          <option key={i} value={p.id}>
                            {p.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      checked={edge.dashed}
                      onChange={(e) =>
                        edit({
                          ...draft,
                          edges: draft.edges.map((line, i) =>
                            i === index ? { ...line, dashed: e.target.checked } : line,
                          ),
                        })
                      }
                    />
                    虚线
                  </label>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      edit({ ...draft, edges: draft.edges.filter((_, i) => i !== index) })
                    }
                  >
                    删除连线
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn"
                disabled={draft.edges.length >= 30 || draft.points.length < 2}
                onClick={() =>
                  edit({
                    ...draft,
                    edges: [
                      ...draft.edges,
                      { from: draft.points[0].id, to: draft.points[1].id, dashed: false },
                    ],
                  })
                }
              >
                添加连线
              </button>
            </details>
            <details>
              <summary>数值与文字标注</summary>
              {model && <p className="field-hint">题设标注随三维投影自动更新。</p>}
              {(draft.labels ?? []).map((label, index) => (
                <div className="diagram-edit-row" key={index}>
                  <label>
                    标注
                    <input
                      value={label.text}
                      disabled={!!model}
                      maxLength={40}
                      onChange={(e) =>
                        edit({
                          ...draft,
                          labels: draft.labels?.map((item, i) =>
                            i === index ? { ...item, text: e.target.value } : item,
                          ),
                        })
                      }
                    />
                  </label>
                  {(['x', 'y'] as const).map((axis) => (
                    <label key={axis}>
                      {axis.toUpperCase()}
                      <input
                        type="number"
                        disabled={!!model}
                        min="30"
                        max={axis === 'x' ? 570 : 370}
                        value={label[axis]}
                        onChange={(e) =>
                          edit({
                            ...draft,
                            labels: draft.labels?.map((item, i) =>
                              i === index ? { ...item, [axis]: Number(e.target.value) } : item,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="btn"
                    disabled={!!model}
                    onClick={() =>
                      edit({ ...draft, labels: draft.labels?.filter((_, i) => i !== index) })
                    }
                  >
                    删除标注
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn"
                disabled={!!model || (draft.labels?.length ?? 0) >= 20}
                onClick={() =>
                  edit({
                    ...draft,
                    labels: [...(draft.labels ?? []), { text: '2', x: 300, y: 330 }],
                  })
                }
              >
                添加标注
              </button>
            </details>
            <label>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              已对照原题核对顶点、连线和标注
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={!checked || !!unsupported}
              onClick={apply}
            >
              应用为题目配图
            </button>
          </fieldset>
          {applied && (
            <p role="status">已应用重绘配图，导入题库时将保存此图。修改草稿后需再次应用。</p>
          )}
        </>
      )}
    </section>
  );
}
