'use client';
import dynamic from 'next/dynamic';
import { Component, useRef, useEffect, useState, type ReactNode } from 'react';
import type { StudyProblem } from '@/shared/study-contract';
import { request, errorMessage } from '@/shared/api/client';
import { GEOMETRY_SKILLS } from './skill-library';
import { evaluateUniversal, type UniversalPlan } from './universal';
import type { Positions, Vec3 } from './scene';
import { distance } from './geometry';
import './workbench.css';
const Renderer = dynamic(() => import('./scene-renderer'), {
  ssr: false,
  loading: () => <p>正在载入三维视图…</p>,
});
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert">三维渲染失败；参数与量测仍可查看。请检查浏览器硬件加速。</p>
    ) : (
      this.props.children
    );
  }
}
type Result = { plan: UniversalPlan; samples: number; warnings: string[]; verification: string };
export function UniversalWorkbench({
  problem,
  photo,
  initialQuestion = 0,
  initialProgress = '',
}: {
  problem: StudyProblem;
  photo?: string;
  initialQuestion?: number;
  initialProgress?: string;
}) {
  const [result, setResult] = useState<Result | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [values, setValues] = useState<Record<string, number>>({}),
    [selected, setSelected] = useState<string[]>([]),
    [lines, setLines] = useState<[string, string][]>([]),
    [view, setView] = useState<'iso' | 'top' | 'front'>('iso'),
    [revision, setRevision] = useState(0),
    [opacity, setOpacity] = useState(0.4),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [hint, setHint] = useState(''),
    [progress, setProgress] = useState(initialProgress),
    [question, setQuestion] = useState(initialQuestion);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function call(kind: 'plan' | 'hint') {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    setHint('');
    if (kind === 'plan') {
      setResult(null);
      setConfirmed(false);
      setLines([]);
      setSelected([]);
    }
    try {
      if (kind === 'plan') {
        const next = await request<Result>('/api/v1', '/ai/geometry-scene', {
          method: 'POST',
          body: { problem, ...(photo ? { photo } : {}) },
          signal: controller.signal,
          timeoutMs: 105000,
        });
        setResult(next);
        setValues(Object.fromEntries(next.plan.parameters.map((p) => [p.id, p.initial])));
      } else if (result) {
        const response = await request<{ hint: string }>('/api/v1', '/ai/geometry-scene/hint', {
          method: 'POST',
          body: { problem, plan: result.plan, values, selected, question, progress },
          signal: controller.signal,
          timeoutMs: 55000,
        });
        setHint(response.hint);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(errorMessage(e));
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  let evaluation: ReturnType<typeof evaluateUniversal> | null = null;
  let failure = '';
  try {
    if (result) evaluation = evaluateUniversal(result.plan, values);
  } catch (e) {
    failure = errorMessage(e);
  }
  // Normalize display only. All mathematical measurements remain in original coordinates.
  const trace: Vec3[] = [];
  if (result?.plan.trace) {
    const t = result.plan.trace,
      parameter = result.plan.parameters.find((p) => p.id === t.parameter);
    if (parameter)
      for (let i = 0; i <= 120; i++)
        trace.push(
          evaluateUniversal(result.plan, {
            ...values,
            [parameter.id]: parameter.min + ((parameter.max - parameter.min) * i) / 120,
          }).positions[t.point],
        );
  }
  const traceLength = trace.slice(1).reduce((sum, p, i) => sum + distance(p, trace[i]), 0);
  let renderedTrace: Vec3[] = [];
  let rendered: Positions = {};
  if (evaluation) {
    const all = [...Object.values(evaluation.positions), ...trace];
    const lo = [0, 1, 2].map((i) => Math.min(...all.map((p) => p[i]))),
      hi = [0, 1, 2].map((i) => Math.max(...all.map((p) => p[i])));
    const k = 4 / Math.max(1e-6, ...hi.map((v, i) => v - lo[i]));
    renderedTrace = trace.map(
      (p) => p.map((v, i) => (v - (lo[i] + hi[i]) / 2) * k + [2, 2, 0.6][i]) as Vec3,
    );
    rendered = Object.fromEntries(
      Object.entries(evaluation.positions).map(([id, p]) => [
        id,
        p.map((v, i) => (v - (lo[i] + hi[i]) / 2) * k + [2, 2, 0.6][i]) as Vec3,
      ]),
    );
  }
  return (
    <section className="panel universal-lab">
      <h2>本题的交互探索</h2>
      <p>
        AI
        将结合原图与已核对条件生成构造方案；支持多面体、边上动点、比例联动、折叠旋转和垂足。未覆盖的条件会单独列出。
      </p>
      <button className="btn primary" disabled={busy} onClick={() => void call('plan')}>
        {busy ? '正在处理…' : result ? '重新生成方案' : '为本题生成可视化方案'}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <h3>{result.plan.title}</h3>
          <details>
            <summary>构造思路与能力组合</summary>
            <p>{result.plan.reason}</p>
            <ol>
              {result.plan.skills?.map((s, i) => (
                <li key={i}>{GEOMETRY_SKILLS.find((k) => k.name === s.skill)?.purpose}</li>
              ))}
            </ol>
          </details>
          <p>
            {result.verification}（检查 {result.samples} 组参数）
          </p>
          {result.warnings.length > 0 && (
            <div className="notice amber">
              <strong>仅供示意：以下条件尚未确认</strong>
              <ul>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <details>
            <summary>逐条核对题设与构造</summary>
            <ul>
              {result.plan.coverage.map((c) => (
                <li key={c.index}>
                  {c.quote}：{c.explanation}（
                  {c.status === 'represented' ? '方案声称已表达' : '未覆盖'}）
                </li>
              ))}
            </ul>
            <p>点名：{evaluation?.scene.points.map((n) => n.label).join('、')}</p>
          </details>
          {!confirmed && (
            <button className="btn" onClick={() => setConfirmed(true)}>
              已核对，打开{result.warnings.length ? '示意' : '交互'}模型
            </button>
          )}
          {confirmed && evaluation && (
            <div className="universal-layout">
              <div>
                <div className="geo-canvas" style={{ height: 460 }}>
                  <Boundary key={revision}>
                    <Renderer
                      traces={renderedTrace.length ? [renderedTrace] : []}
                      scene={{
                        ...evaluation.scene,
                        points: evaluation.scene.points.map((p) => ({
                          ...p,
                          initial: rendered[p.id],
                        })),
                      }}
                      positions={rendered}
                      constructions={lines.map((points, i) => ({ id: 'user' + i, points }))}
                      selectedPoints={selected}
                      selectedLine=""
                      onPoint={(id) => {
                        if (busy) return;
                        setSelected((old) =>
                          old.includes(id) ? old.filter((x) => x !== id) : [...old.slice(-1), id],
                        );
                        setHint('');
                      }}
                      onLine={() => {}}
                      showBase={true}
                      showGhost={false}
                      opacity={opacity}
                      cameraVersion={revision}
                      view={view}
                    />
                  </Boundary>
                </div>
                <div className="geo-view-tools">
                  {(['iso', 'top', 'front'] as const).map((v, i) => (
                    <button className="btn" key={v} onClick={() => setView(v)}>
                      {['空间视角', '俯视', '正视'][i]}
                    </button>
                  ))}
                  <button
                    className="btn"
                    onClick={() => {
                      setRevision((x) => x + 1);
                      setView('iso');
                    }}
                  >
                    重置视角
                  </button>
                </div>
                <p>拖动旋转 · 滚轮缩放 · 选择两个点查看距离或连接辅助线</p>
              </div>
              <aside>
                <h3>探索参数</h3>
                {result.plan.parameters.length === 0 && (
                  <p>本题为固定构型，可旋转观察并添加辅助线。</p>
                )}
                {result.plan.parameters.map((p) => (
                  <label className="field" key={p.id}>
                    <span>
                      {p.label}：
                      {p.unit === 'rad'
                        ? (((values[p.id] ?? p.initial) * 180) / Math.PI).toFixed(1) + '°'
                        : (values[p.id] ?? p.initial).toFixed(3)}
                    </span>
                    <input
                      type="range"
                      aria-label={p.label}
                      disabled={busy}
                      min={0}
                      max={200}
                      step={1}
                      value={Math.round(
                        (((values[p.id] ?? p.initial) - p.min) / (p.max - p.min)) * 200,
                      )}
                      onChange={(e) => {
                        const next = {
                          ...values,
                          [p.id]: p.min + ((p.max - p.min) * Number(e.target.value)) / 200,
                        };
                        try {
                          evaluateUniversal(result.plan, next);
                          setValues(next);
                          setHint('');
                          setError('');
                        } catch (err) {
                          setError(errorMessage(err));
                        }
                      }}
                    />
                  </label>
                ))}
                <label className="field">
                  <span>面透明度</span>
                  <input
                    aria-label="面透明度"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                  />
                </label>
                <h3>本题量测</h3>
                {trace.length > 0 && (
                  <p data-testid="trace-length">
                    紫色轨迹的采样长度：{traceLength.toFixed(5)}（数值近似）
                  </p>
                )}
                {result.plan.metrics.map((m) => (
                  <p key={m.id}>
                    {m.label}：
                    {evaluation.metrics[m.id]?.value?.toFixed(4) ??
                      evaluation.metrics[m.id]?.reason ??
                      '未定义'}
                  </p>
                ))}
                {selected.length === 2 && (
                  <>
                    <p>
                      选中两点距离：
                      {distance(
                        evaluation.positions[selected[0]],
                        evaluation.positions[selected[1]],
                      ).toFixed(4)}
                    </p>
                    <button
                      className="btn"
                      onClick={() => {
                        if (!lines.some((l) => l.includes(selected[0]) && l.includes(selected[1])))
                          setLines([...lines, [selected[0], selected[1]]]);
                      }}
                    >
                      连接辅助线
                    </button>
                  </>
                )}
                <button
                  className="btn"
                  disabled={!lines.length}
                  onClick={() => setLines(lines.slice(0, -1))}
                >
                  撤销辅助线
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setValues(
                      Object.fromEntries(result.plan.parameters.map((p) => [p.id, p.initial])),
                    );
                    setLines([]);
                    setSelected([]);
                    setHint('');
                  }}
                >
                  恢复初始状态
                </button>
              </aside>
            </div>
          )}
          {failure && <p role="alert">{failure}</p>}
          {confirmed && (
            <>
              <label className="field">
                <span>当前分问</span>
                <select
                  disabled={busy}
                  value={question}
                  onChange={(e) => {
                    setQuestion(Number(e.target.value));
                    setHint('');
                  }}
                >
                  {problem.questions.map((q, i) => (
                    <option key={i} value={i}>
                      {q}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>我的观察与追问</span>
                <textarea
                  maxLength={6000}
                  disabled={busy}
                  value={progress}
                  onChange={(e) => {
                    setProgress(e.target.value);
                    setHint('');
                  }}
                />
              </label>
              <button
                className="btn"
                disabled={busy || !!failure}
                onClick={() => void call('hint')}
              >
                结合当前构型给我下一步提示
              </button>
              {hint && (
                <p role="status" style={{ whiteSpace: 'pre-wrap' }}>
                  {hint}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
