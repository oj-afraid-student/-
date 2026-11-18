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
export function ProblemScene({ problem }: { problem: StudyProblem }) {
  const [plan, setPlan] = useState<GeometryPlan | null>(null),
    [scene, setScene] = useState<GeometryScene | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [theta, setTheta] = useState(0),
    [point, setPoint] = useState(''),
    [line, setLine] = useState('');
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
        <>
          <p>{plan.reason}</p>
          <p>
            模板：{plan.template}；尺寸：{plan.dimensions.join(' × ')}
          </p>
          <ul>
            {[...plan.evidence, ...plan.missing].map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
          {plan.template === 'box' && (
            <p>请确认点名对应：底面 ABCD，上面 PQRS，AP、BQ、CR、DS 为竖棱。</p>
          )}
          {plan.template === 'square_fold' && (
            <p>
              请确认 ABCD 为正方形、E 为 AB 中点、ADE 沿 DE 翻折且 EBCD 固定；角度探索范围 0°–90°。
            </p>
          )}
          {plan.template === 'unsupported' || plan.missing.length > 0 ? (
            <p>当前模板不足以表达本题，保留文字学习，不生成替代示例。</p>
          ) : (
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
              以上模板与本题一致，生成可交互模型
            </button>
          )}
        </>
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
              onPoint={setPoint}
              onLine={setLine}
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
                type="range"
                min={0}
                max={90}
                value={(theta * 180) / Math.PI}
                onChange={(e) => setTheta((Number(e.target.value) * Math.PI) / 180)}
              />
            </label>
          )}
          <p>选中：{point || line || '无'}</p>
          {scene.metrics.map((m) => (
            <p key={m.id}>
              {m.label}：{evaluated.metrics[m.id].value?.toFixed(4) ?? '未定义'}
            </p>
          ))}
          {scene.assumptions.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </>
      )}
    </section>
  );
}
