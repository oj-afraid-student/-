'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { request, errorMessage } from '@/shared/api/client';
import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/timeouts';
import type { StudyProblem } from '@/shared/study-contract';
import { compilePlan, type GeometryPlan } from './planner';
import { evaluateScene } from './constraints';
import type { GeometryScene } from './scene';
import './workbench.css';
const Renderer = dynamic(() => import('./scene-renderer'), { ssr: false });
export function ProblemScene({
  problem,
  initialQuestion = 0,
  initialProgress = '',
}: {
  problem: StudyProblem;
  initialQuestion?: number;
  initialProgress?: string;
}) {
  const [plan, setPlan] = useState<GeometryPlan | null>(null),
    [scene, setScene] = useState<GeometryScene | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [theta, setTheta] = useState(0),
    [point, setPoint] = useState(''),
    [line, setLine] = useState(''),
    [question, setQuestion] = useState(initialQuestion),
    [progress, setProgress] = useState(initialProgress),
    [hint, setHint] = useState('');
  async function generate() {
    setBusy(true);
    setError('');
    setScene(null);
    setPlan(null);
    try {
      setPlan(
        await request<GeometryPlan>('/api/v1', '/ai/geometry-plan', {
          method: 'POST',
          body: problem,
          timeoutMs: AI_REQUEST_TIMEOUT_MS,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function ask() {
    if (!plan) return;
    setBusy(true);
    setHint('');
    setError('');
    try {
      const result = await request<{ hint: string }>('/api/v1', '/ai/geometry-hint', {
        method: 'POST',
        body: { problem, plan, theta, point, line, question, progress },
        timeoutMs: AI_REQUEST_TIMEOUT_MS,
      });
      setHint(result.hint);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const evaluated = scene ? evaluateScene(scene, theta) : null;
  return (
    <section className="panel">
      <h2>本题的立体几何探索</h2>
      <p>支持长方体及正方形沿中点折叠。先由 AI 匹配模板，再核对点名、尺寸与约束。</p>
      <button className="btn" disabled={busy} onClick={() => void generate()}>
        {busy ? '正在规划…' : '为本题规划三维模型'}
      </button>
      {error && <p role="alert">{error}</p>}
      {plan && (
        <div className="geo-plan-result" role="status">
          {plan.template === 'unsupported' ? (
            <>
              <h3>这道题暂时无法生成交互模型</h3>
              <p>
                当前建模能力尚不能表达本题的全部几何关系。这不是图片上传失败，也不代表题目有错。
              </p>
              <p>
                可继续使用已有的文字提示。若上方题干或条件识别不完整，请先修正；补全条件后仍可能需要新增对应的几何构造支持。
              </p>
            </>
          ) : plan.missing.length > 0 ? (
            <>
              <h3>生成前还需要核对条件</h3>
              <p>部分条件或点名尚未可靠对应到模型。请核对上方原题和条件后重新规划。</p>
              <ul>
                {[...new Set(plan.missing)].slice(0, 5).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h3>{plan.template === 'box' ? '长方体模型' : '正方形折叠模型'}</h3>
              <p>尺寸：{plan.dimensions.join(' × ')}</p>
              <p>请核对模型点名与原题的对应关系：</p>
              <ul>
                {Object.entries(plan.labels ?? {}).map(([id, label]) => (
                  <li key={id}>
                    {id} → {label}
                  </li>
                ))}
              </ul>
              <button
                className="btn"
                onClick={() => {
                  try {
                    setScene(compilePlan(plan));
                    setTheta(0);
                    setPoint('');
                    setLine('');
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                对应关系正确，生成可交互模型
              </button>
            </>
          )}
          <details>
            <summary>查看条件核对详情</summary>
            <p>{plan.reason}</p>
            <ul>
              {plan.coverage?.map((c) => (
                <li key={c.index}>
                  {c.quote}：{c.explanation}（{c.status === 'represented' ? '已对应' : '未对应'}）
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {scene && evaluated && (
        <>
          <p>
            模板约束及 91
            个角度采样校验通过；题意匹配仍以你的核对为准。拖动旋转，滚轮缩放，点击点线查看。
          </p>
          <div className="geo-canvas" style={{ height: 420 }}>
            <Renderer
              scene={scene}
              positions={evaluated.positions}
              constructions={[]}
              selectedPoints={point ? [point] : []}
              selectedLine={line}
              onPoint={(id) => {
                if (busy) return;
                setPoint(id);
                setHint('');
              }}
              onLine={(id) => {
                if (busy) return;
                setLine(id);
                setHint('');
              }}
              showBase={true}
              showGhost={false}
              opacity={0.5}
              cameraVersion={0}
              view="iso"
            />
          </div>
          {scene.motion && (
            <label>
              折叠角 {Math.round((theta * 180) / Math.PI)}°
              <input
                aria-label="本题折叠角"
                disabled={busy}
                type="range"
                min={0}
                max={90}
                value={(theta * 180) / Math.PI}
                onChange={(e) => {
                  setTheta((Number(e.target.value) * Math.PI) / 180);
                  setHint('');
                }}
              />
            </label>
          )}
          <p>选中：{point || line || '无'}</p>
          {scene.metrics.map((m) => (
            <p key={m.id}>
              {m.label}：{evaluated.metrics[m.id].value?.toFixed(4) ?? '未定义'}
            </p>
          ))}
          <label className="field">
            <span>探索哪一问</span>
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
            <span>我的观察、思路或追问</span>
            <textarea
              disabled={busy}
              maxLength={6000}
              value={progress}
              onChange={(e) => {
                setProgress(e.target.value);
                setHint('');
              }}
            />
          </label>
          <button className="btn" disabled={busy} onClick={() => void ask()}>
            结合当前模型给我提示
          </button>
          {hint && (
            <p aria-live="polite" style={{ whiteSpace: 'pre-wrap' }}>
              {hint}
            </p>
          )}
          {scene.assumptions.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </>
      )}
    </section>
  );
}
