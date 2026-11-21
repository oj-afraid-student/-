'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Component, useEffect, useReducer, useState, type ReactNode } from 'react';
import { PageHead } from '@/shared/ui/common';
import { foldScene as scene } from './fixtures';
import { evaluateScene } from './constraints';
import { distance } from './geometry';
import { evaluateMetrics } from './metrics';
import { connectPoints, historyReducer, type Exploration } from './interactions';
import './workbench.css';

const Renderer = dynamic(() => import('./scene-renderer'), {
  ssr: false,
  loading: () => <p className="geo-loading">正在加载三维工作台…</p>,
});
class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="geo-loading" role="alert">
        三维视图暂不可用。请检查 WebGL / 硬件加速后刷新页面；右侧角度与数学量测仍可使用。
      </p>
    ) : (
      this.props.children
    );
  }
}
const initial = (): Exploration => ({ theta: scene.motion!.initial, constructions: [] });
const degrees = (r: number) => (r * 180) / Math.PI;

export function GeometryWorkbench() {
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initial(),
    future: [],
  });
  const state = history.present;
  const [selectedPoints, setSelectedPoints] = useState<string[]>([]);
  const [selectedLine, setSelectedLine] = useState('');
  const [secondLine, setSecondLine] = useState('');
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [showBase, setShowBase] = useState(true);
  const [showGhost, setShowGhost] = useState(true);
  const [opacity, setOpacity] = useState(0.55);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [view, setView] = useState<'iso' | 'top' | 'front'>('iso');
  const evaluated = evaluateScene(scene, state.theta);
  const lines = [...scene.segments, ...state.constructions];
  const line = lines.find((s) => s.id === selectedLine);
  const other = lines.find((s) => s.id === secondLine);
  const angle =
    line && other
      ? evaluateMetrics(
          [
            {
              id: 'angle',
              label: '两直线最小夹角',
              type: 'line_angle',
              lines: [line.points, other.points],
            },
          ],
          evaluated.positions,
        ).angle
      : undefined;
  const name = (id: string) => scene.points.find((p) => p.id === id)?.label ?? id;
  const lineName = (points: string[]) => points.map(name).join('');

  function update(theta: number, commit = false) {
    setPlaying(false);
    try {
      evaluateScene(scene, theta);
      dispatch({ type: commit ? 'commit' : 'preview', value: { ...state, theta } });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '构型无法更新。');
    }
  }
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const theta = Math.min(
        Math.PI / 2,
        state.theta + (Math.min(0.1, (now - previous) / 1000) * Math.PI) / 12,
      );
      previous = now;
      try {
        evaluateScene(scene, theta);
        dispatch({ type: 'preview', value: { ...state, theta } });
        if (theta === Math.PI / 2) setPlaying(false);
      } catch (e) {
        setPlaying(false);
        setError(e instanceof Error ? e.message : '已停止无效运动。');
      }
    }, 33);
    return () => window.clearInterval(timer);
  }, [playing, state]);

  function selectPoint(id: string) {
    setSelectedPoints((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current.slice(-1), id],
    );
    setError('');
  }
  function connect() {
    setPlaying(false);
    try {
      const constructions = connectPoints(scene, state.constructions, selectedPoints);
      dispatch({ type: 'commit', value: { ...state, constructions } });
      setSelectedLine(constructions.at(-1)!.id);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接。');
    }
  }
  function reset() {
    setPlaying(false);
    dispatch({ type: 'reset', value: initial() });
    setSelectedPoints([]);
    setSelectedLine('');
    setSecondLine('');
    setError('');
    setShowBase(true);
    setShowGhost(true);
    setOpacity(0.55);
    setView('iso');
    setCameraVersion((n) => n + 1);
  }
  return (
    <div className="geo-workbench">
      <Link className="btn" href="/study">
        上传自己的题目 · AI 分步学习
      </Link>
      <PageHead
        eyebrow="GEOMETRY LAB · 离线示范"
        title="立体几何实验室"
        description="改变一个角度，观察不变的约束与变化的距离。"
        actions={<span className="tag green">确定性计算 · 无需 AI</span>}
      />
      <div className="geo-layout">
        <aside className="geo-problem geo-card">
          <span className="geo-kicker">01 / 读懂题设</span>
          <h2>正方形沿 DE 翻折</h2>
          <p>把三角形 A₀DE 沿折痕 DE 翻起，运动后的顶点记为 A′。</p>
          <ul>
            {scene.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <div className="geo-note">
            <strong>先想一想</strong>
            <p>折叠时哪些长度不变？A′ 到底面的距离会怎样变化？</p>
          </div>
          <p className="geo-small">E 仅在折前是 A₀B 的中点。折后不能继续把 E 当作 A′B 的中点。</p>
          <details>
            <summary>坐标约定与计算依据</summary>
            <p>{scene.assumptions[0]}</p>
            <p>A₀=(0,0,0)，B=(4,0,0)，C=(4,4,0)，D=(0,4,0)，E=(2,0,0)。</p>
            <p>绕固定轴 DE 刚体旋转。h(θ)=4/√5 · sin θ；界面数值由当前点坐标独立计算。</p>
          </details>
        </aside>
        <section className="geo-stage geo-card" aria-label="三维几何场景">
          <div className="geo-toolbar">
            <span className="geo-kicker">02 / 观察与构造</span>
            <span className="tag green" data-testid="geometry-valid">
              硬约束已验证
            </span>
          </div>
          <div className="geo-canvas">
            <ViewBoundary>
              <Renderer
                scene={scene}
                positions={evaluated.positions}
                constructions={state.constructions}
                selectedPoints={selectedPoints}
                selectedLine={selectedLine}
                onPoint={selectPoint}
                onLine={setSelectedLine}
                showBase={showBase}
                showGhost={showGhost}
                opacity={opacity}
                cameraVersion={cameraVersion}
                view={view}
              />
            </ViewBoundary>
          </div>
          <div className="geo-view-tools">
            {(['iso', 'top', 'front'] as const).map((v, i) => (
              <button
                key={v}
                className="btn small"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {['等轴测', '俯视', '前视'][i]}
              </button>
            ))}
            <button
              className="btn small"
              onClick={() => {
                setView('iso');
                setCameraVersion((n) => n + 1);
              }}
            >
              重置镜头
            </button>
          </div>
          <p className="geo-help">
            拖动空白旋转 · 滚轮缩放 · 右键拖动平移
            <br />
            触屏：单指旋转，双指缩放/平移；点标签可选择。
          </p>
          <div className="geo-legend">
            <span>● 固定底面</span>
            <span>● 活动刚体</span>
            <span>┄ 遮挡边 / 折前虚影</span>
          </div>
        </section>
        <aside className="geo-inspector geo-card">
          <span className="geo-kicker">03 / 动态量测</span>
          <h2>从变化中找关系</h2>
          {scene.metrics.map((metric) => {
            const result = evaluated.metrics[metric.id];
            return (
              <div className="geo-metric" key={metric.id}>
                <span>{metric.label}</span>
                <strong data-testid={`metric-${metric.id}`}>
                  {result.value === undefined ? '未定义' : result.value.toFixed(4)}
                </strong>
                <small>{result.reason ?? '长度单位 · 数值近似'}</small>
              </div>
            );
          })}
          <div className="geo-construction">
            <h3>选两点，连接辅助线</h3>
            <div className="geo-point-list">
              {scene.points.map((p) => (
                <button
                  key={p.id}
                  className="btn small"
                  aria-label={`列表选择点 ${p.label}`}
                  aria-pressed={selectedPoints.includes(p.id)}
                  onClick={() => selectPoint(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p>已选：{selectedPoints.length ? selectedPoints.map(name).join('、') : '尚未选择'}</p>
            <button
              className="btn primary"
              disabled={selectedPoints.length !== 2}
              onClick={connect}
            >
              连接辅助线
            </button>
            <p className="geo-small">
              建议连接 A′C，观察它如何随折叠变化。固定点只能选择；A′ 由折叠角驱动。
            </p>
          </div>
          <label className="field">
            <span>选择线段</span>
            <select value={line?.id ?? ''} onChange={(e) => setSelectedLine(e.target.value)}>
              <option value="">请选择</option>
              {lines.map((s) => (
                <option key={s.id} value={s.id}>
                  {lineName(s.points)}
                  {s.id.startsWith('user-') ? ' · 辅助线' : ''}
                </option>
              ))}
            </select>
          </label>
          {line && (
            <>
              <p data-testid="selected-length">
                {lineName(line.points)} ={' '}
                {distance(
                  evaluated.positions[line.points[0]],
                  evaluated.positions[line.points[1]],
                ).toFixed(4)}
              </p>
              <label className="field">
                <span>与另一条直线测角</span>
                <select value={other?.id ?? ''} onChange={(e) => setSecondLine(e.target.value)}>
                  <option value="">请选择</option>
                  {lines
                    .filter((s) => s.id !== line.id)
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {lineName(s.points)}
                      </option>
                    ))}
                </select>
              </label>
              {angle && (
                <p>
                  最小夹角：
                  {angle.value === undefined ? angle.reason : `${angle.value.toFixed(2)}°`}
                  <br />
                  <small>取 0°–90°；不是指定半平面的二面角。</small>
                </p>
              )}
            </>
          )}
          <details>
            <summary>显示与验证</summary>
            <label>
              <input
                type="checkbox"
                checked={showBase}
                onChange={(e) => setShowBase(e.target.checked)}
              />
              显示底面
            </label>
            <label>
              <input
                type="checkbox"
                checked={showGhost}
                onChange={(e) => setShowGhost(e.target.checked)}
              />
              显示折前虚影
            </label>
            <label>
              活动面透明度
              <input
                aria-label="活动面透明度"
                type="range"
                min="0.15"
                max="0.9"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
            </label>
            <p>最大归一化残差：{evaluated.residual.toExponential(2)}（容差 10⁻⁹）</p>
            <p>AD、AE、DE 长度保持不变；B、C、D、E 固定。</p>
          </details>
        </aside>
        <section className="geo-controls geo-card" aria-label="折叠控制">
          <div>
            <span className="geo-kicker">折叠角 θ</span>
            <strong>{degrees(state.theta).toFixed(1)}°</strong>
          </div>
          <div className="geo-slider">
            <input
              aria-label="折叠角"
              type="range"
              min="0"
              max="90"
              step="0.1"
              value={degrees(state.theta)}
              onPointerDown={() => {
                setPlaying(false);
                dispatch({ type: 'checkpoint' });
              }}
              onKeyDown={(e) => {
                if (
                  !e.repeat &&
                  [
                    'ArrowLeft',
                    'ArrowRight',
                    'ArrowUp',
                    'ArrowDown',
                    'Home',
                    'End',
                    'PageUp',
                    'PageDown',
                  ].includes(e.key)
                )
                  dispatch({ type: 'checkpoint' });
              }}
              onChange={(e) => update((Number(e.target.value) * Math.PI) / 180)}
            />
            <div>
              <span>0° · 平展</span>
              <span>90° · 直立</span>
            </div>
          </div>
          <label className="geo-angle-input">
            角度数值
            <input
              aria-label="角度数值"
              type="number"
              min="0"
              max="90"
              step="1"
              value={Number(degrees(state.theta).toFixed(1))}
              onChange={(e) => {
                if (e.target.value !== '') update((e.target.valueAsNumber * Math.PI) / 180, true);
              }}
            />
          </label>
          <div className="geo-buttons">
            <button
              className="btn primary"
              onClick={() => {
                if (!playing) {
                  dispatch({ type: 'checkpoint' });
                  if (state.theta >= Math.PI / 2)
                    dispatch({ type: 'preview', value: { ...state, theta: 0 } });
                }
                setPlaying(!playing);
              }}
            >
              {playing ? '暂停' : '播放折叠'}
            </button>
            <button
              className="btn"
              disabled={!history.past.length}
              onClick={() => {
                setPlaying(false);
                dispatch({ type: 'undo' });
              }}
            >
              撤销
            </button>
            <button
              className="btn"
              disabled={!history.future.length}
              onClick={() => {
                setPlaying(false);
                dispatch({ type: 'redo' });
              }}
            >
              重做
            </button>
            <button className="btn" onClick={reset}>
              恢复初始
            </button>
          </div>
          {error && (
            <p className="notice error geo-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
