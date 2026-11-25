'use client';
import { useEffect, useMemo, useRef, useState, Component, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import type { StudyProblem } from '@/shared/study-contract';
import { preparePhoto } from '@/shared/prepare-photo';
import { request, errorMessage } from '@/shared/api/client';
import { evaluateUniversal, validateUniversal, type UniversalPlan } from './universal';
import { pointDragBindings, buildPointDragPath, planDisplayTransform } from './point-drag';
import { studioExample } from './studio-examples';
import { addMidpoint, addFaceFold, measureObservation, type Observation } from './studio-tools';
import { distance } from './geometry';
import './workbench.css';
import './lab-studio.css';
const Renderer = dynamic(() => import('./scene-renderer'), {
  ssr: false,
  loading: () => <div className="studio-empty">正在载入三维画布…</div>,
});
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert">画布暂不可用，请检查 WebGL 支持。测量与参数仍可操作。</p>
    ) : (
      this.props.children
    );
  }
}
type Result = ReturnType<typeof validateUniversal>;
type Entry = { problem: StudyProblem; photo?: string; result: Result };
const empty: StudyProblem = {
  title: '我的几何题',
  text: '',
  conditions: [],
  questions: ['探索题目中的几何关系'],
  uncertainties: [],
};
const titles = {
  distance: '线段长度',
  point_line: '点到直线距离',
  height: '点到平面距离',
  line_angle: '两直线夹角',
};
function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="studio-stepper">
      <span>{label}</span>
      <button
        aria-label={'减小' + label}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <output>
        {Math.round(value * 100) / 100}
        {suffix}
      </output>
      <button
        aria-label={'增大' + label}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        +
      </button>
    </div>
  );
}
export function LabStudio({
  initialProblem,
  initialPhoto,
  example,
}: {
  initialProblem?: StudyProblem;
  initialPhoto?: string;
  example?: string;
}) {
  const initial = useMemo(
    () => (!initialProblem ? studioExample(example ?? 'cylinder') : null),
    [initialProblem, example],
  );
  const [problem, setProblem] = useState(initialProblem ?? initial?.problem ?? empty),
    [photo, setPhoto] = useState(initialPhoto ?? ''),
    [photoName, setPhotoName] = useState(initialPhoto ? '带入的题图' : ''),
    [needsRecognition, setNeedsRecognition] = useState(false),
    [result, setResult] = useState<Result | null>(
      initial ? validateUniversal(initial.plan, initial.problem) : null,
    );
  const [values, setValues] = useState<Record<string, number>>({}),
    [selected, setSelected] = useState<string[]>([]),
    [lines, setLines] = useState<[string, string][]>([]),
    [observations, setObservations] = useState<Observation[]>([]),
    [observationId, setObservationId] = useState(''),
    [kind, setKind] = useState<Observation['kind']>('distance'),
    [measurePoints, setMeasurePoints] = useState(['', '', '', '']);
  const [view, setView] = useState<'iso' | 'front' | 'top' | 'right'>('iso'),
    [revision, setRevision] = useState(0),
    [showFaces, setShowFaces] = useState(true),
    [showLabels, setShowLabels] = useState(true),
    [showLengths, setShowLengths] = useState(false),
    [showAux, setShowAux] = useState(true),
    [occlusion, setOcclusion] = useState(true),
    [fontSize, setFontSize] = useState(14),
    [lineWidth, setLineWidth] = useState(1.4),
    [opacity, setOpacity] = useState(40),
    [palette, setPalette] = useState(0),
    [locked, setLocked] = useState(false),
    [traceEnabled, setTraceEnabled] = useState(false),
    [tracePoint, setTracePoint] = useState(''),
    [foldEnabled, setFoldEnabled] = useState(true),
    [foldParameter, setFoldParameter] = useState(''),
    [selectedFace, setSelectedFace] = useState(''),
    [choosingFace, setChoosingFace] = useState(false),
    [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState<Entry[]>([]),
    [historyIndex, setHistoryIndex] = useState(-1),
    [exampleKind, setExampleKind] = useState(example ?? 'cylinder'),
    [settings, setSettings] = useState(false),
    [modelInfo, setModelInfo] = useState(''),
    [strictCoverage, setStrictCoverage] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(
      initial ? '已加载解析示例，可选择点、添加测量或导入新题' : '请核对条件后生成模型',
    ),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    imageVersion = useRef(0),
    observationCounter = useRef(0);
  useEffect(
    () => () => {
      controller.current?.abort();
      imageVersion.current++;
    },
    [],
  );
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const stopRequest = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  };
  function resetTools() {
    setSelected([]);
    setLines([]);
    setObservations([]);
    setObservationId('');
    setMeasurePoints(['', '', '', '']);
    setPlaying(false);
    setFoldEnabled(true);
    setFoldParameter('');
    setSelectedFace('');
    setChoosingFace(false);
    setTracePoint('');
    setTraceEnabled(false);
    setValues({});
  }
  function install(entry: Entry, remember = true) {
    stopRequest();
    imageVersion.current++;
    setPhotoBusy(false);
    setProblem(entry.problem);
    setPhoto(entry.photo ?? '');
    setPhotoName(entry.photo ? '题图' : '');
    setResult(entry.result);
    setNeedsRecognition(false);
    resetTools();
    setError('');
    setStatus(entry.result.verification);
    if (remember) {
      setHistory((old) => [...old.slice(-19), entry]);
      setHistoryIndex(Math.min(history.length, 19));
    }
  }
  function navigateHistory(index: number) {
    if (!history[index]) return;
    install(history[index], false);
    setHistoryIndex(index);
  }
  async function upload(f: File) {
    stopRequest();
    const version = ++imageVersion.current;
    setPhotoBusy(true);
    setError('');
    try {
      const data = await preparePhoto(f);
      if (version !== imageVersion.current) return;
      setPhoto(data);
      setPhotoName(f.name);
      setNeedsRecognition(true);
      setProblem({ ...empty });
      setResult(null);
      resetTools();
      setStatus('图片已就绪，点击“识别并生成”');
    } catch (e) {
      if (version === imageVersion.current) setError(errorMessage(e));
    } finally {
      if (version === imageVersion.current) setPhotoBusy(false);
    }
  }
  async function paste() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          await upload(new File([await item.getType(type)], '剪贴板图片', { type }));
          return;
        }
      }
      setError('剪贴板中没有图片，请复制题图或选择文件。');
    } catch {
      setError('无法读取剪贴板，请在本页按 Ctrl+V 粘贴图片，或使用“选择图片”。');
    }
  }
  async function generate() {
    if (busy || photoBusy) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError('');
    setPlaying(false);
    try {
      let p = problem;
      if (needsRecognition) {
        setStatus('正在识别题干并复核示意图…');
        p = await request<StudyProblem>('/api/v1', '/ai/study', {
          method: 'POST',
          body: { action: 'recognize', text: problem.text, photo },
          signal: c.signal,
          timeoutMs: 110000,
        });
        setProblem(p);
        setNeedsRecognition(false);
      }
      if (!p.text.trim()) throw new Error('请先输入题目或选择图片');
      if (p.uncertainties.length)
        throw new Error(
          '识别结果有待核对项。请在左侧对照原图修正条件，点击“已核对并补充条件”后再生成。',
        );
      setStatus('正在规划模型并检查几何约束…');
      const next = await request<Result>('/api/v1', '/ai/geometry-scene', {
        method: 'POST',
        body: { problem: p, ...(photo ? { photo } : {}) },
        signal: c.signal,
        timeoutMs: 105000,
      });
      if (
        strictCoverage &&
        (p.uncertainties.length ||
          next.plan.coverage.some((row) => row.status !== 'represented') ||
          p.conditions.some((_, i) => !next.plan.coverage.some((row) => row.index === i)))
      )
        throw new Error(
          '严格模式：仍有未确认或未覆盖的条件，请补充条件后重试，或在模型设置切换到探索模式。',
        );
      if (!c.signal.aborted) install({ problem: p, photo, result: next });
    } catch (e) {
      if (!c.signal.aborted) {
        setError(errorMessage(e));
        setStatus('生成未完成，已保留题目供修改重试');
      }
    } finally {
      if (controller.current === c) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  const evaluation = useMemo(() => {
    if (!result) return null;
    try {
      return evaluateUniversal(result.plan, values);
    } catch {
      return null;
    }
  }, [result, values]);
  const transform = useMemo(() => {
    if (!result) return null;
    try {
      return planDisplayTransform(result.plan);
    } catch {
      return null;
    }
  }, [result]);
  const bindings = useMemo(() => (result ? pointDragBindings(result.plan) : {}), [result]);
  const parameters = result?.plan.parameters ?? [];
  const angleParams = parameters.filter((p) => p.unit === 'rad');
  const fold = angleParams.find((p) => p.id === foldParameter) ?? angleParams[0];
  function change(parameter: string, value: number) {
    if (!result) return;
    const next = { ...values, [parameter]: value };
    try {
      evaluateUniversal(result.plan, next);
      setValues(next);
      setError('');
    } catch (e) {
      setPlaying(false);
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    if (!playing || !fold || !result) return;
    const tick = window.setInterval(() => {
      setValues((previous) => {
        const current = previous[fold.id] ?? fold.initial;
        const next = {
          ...previous,
          [fold.id]:
            current >= fold.max
              ? fold.min
              : Math.min(fold.max, current + (fold.max - fold.min) / 180),
        };
        try {
          evaluateUniversal(result.plan, next);
          return next;
        } catch {
          return previous;
        }
      });
    }, 40);
    return () => clearInterval(tick);
  }, [playing, fold, result]);
  const rendered = useMemo(
    () =>
      evaluation && transform
        ? Object.fromEntries(
            Object.entries(evaluation.positions).map(([id, p]) => [id, transform(p)]),
          )
        : {},
    [evaluation, transform],
  );
  const trace = useMemo(() => {
    if (!result || !traceEnabled) return [];
    const point = tracePoint || result.plan.trace?.point || selected[0] || Object.keys(bindings)[0];
    const parameter = bindings[point];
    if (!point || !parameter) return [];
    return buildPointDragPath(result.plan, values, point, parameter).samples.map((s) => s.position);
  }, [result, traceEnabled, tracePoint, selected, bindings, values]);
  const traceLength = trace.slice(1).reduce((total, p, i) => total + distance(p, trace[i]), 0);
  function applyPlan(plan: UniversalPlan) {
    try {
      const next = validateUniversal(plan, problem);
      setResult(next);
      setError('');
      setStatus('辅助构造已添加');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function midpoint() {
    if (!result || selected.length !== 2) {
      setError('请在画布上依次选择两个点');
      return;
    }
    applyPlan(addMidpoint(result.plan, selected as [string, string]));
  }
  function connect() {
    if (selected.length !== 2) {
      setError('请先选择两个点');
      return;
    }
    setLines((old) => [...old, [selected[0], selected[1]]]);
    setStatus('已连接辅助线');
  }
  function resetAll() {
    resetTools();
    setView('iso');
    setRevision((x) => x + 1);
    setStatus('视角、参数和辅助操作已复位');
  }
  const pointOptions = evaluation?.scene.points ?? [];
  const required = kind === 'distance' ? 2 : kind === 'point_line' ? 3 : 4;
  function addObservation() {
    const ids = Array.from(
      { length: required },
      (_, i) => measurePoints[i] || pointOptions[i]?.id || '',
    );
    if (ids.some((id) => !id)) {
      setError('模型中没有足够的点可供测量');
      return;
    }
    const item: Observation = {
      id: 'observation' + ++observationCounter.current,
      kind,
      points: ids,
    };
    const value = measureObservation(item, evaluation!.positions);
    if (value.includes('无法')) {
      setError(value);
      return;
    }
    setObservations((old) => [...old, item]);
    setObservationId(item.id);
    setError('');
  }
  function editConditions(value: string) {
    stopRequest();
    setProblem((p) => ({ ...p, conditions: value.split('\n').filter(Boolean) }));
    setStatus('条件已修改，点击生成以更新模型');
  }
  function currentFace(id: string) {
    if (!choosingFace) return;
    setSelectedFace(id);
    setChoosingFace(false);
    setFoldEnabled(true);
    setStatus('已选择面；已有折叠可调角度，或选择两个顶点建立新折痕');
  }
  const paletteNames = ['柔和淡彩', '青蓝透明', '原始配色'];
  const scene =
    evaluation && transform
      ? {
          ...evaluation.scene,
          points: evaluation.scene.points.map((p) => ({ ...p, initial: rendered[p.id] })),
          faces: evaluation.scene.faces.map((f, i) => ({
            ...f,
            color:
              palette === 2
                ? f.color
                : palette === 1
                  ? i % 2
                    ? '#7fc5cf'
                    : '#83b8d4'
                  : ['#b8d9e8', '#b1d5c9', '#d9cdb1', '#c9c0dc'][i % 4],
          })),
          solids: evaluation.scene.solids?.map((s) => ({
            ...s,
            radius: s.radius * distance(transform([0, 0, 0]), transform([1, 0, 0])),
            color: palette === 1 ? '#83b8d4' : s.color,
          })),
        }
      : null;
  return (
    <div
      ref={root}
      className="lab-studio"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setSettings(false);
          setPlaying(false);
          setChoosingFace(false);
          setSelected([]);
        }
      }}
      onPaste={(e) => {
        const f = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
        if (f) {
          e.preventDefault();
          void upload(f);
        }
      }}
    >
      <header className="studio-header">
        <Link href="/learn" className="studio-brand">
          <span>知</span>
          <div>
            <strong>知序 · 立体几何实验室</strong>
            <small>导入题目图片，生成可旋转的空间结构</small>
          </div>
        </Link>
        <div className="studio-history">
          <span>本次历史</span>
          <button
            aria-label="上一条历史"
            disabled={historyIndex <= 0}
            onClick={() => navigateHistory(historyIndex - 1)}
          >
            ‹
          </button>
          <select
            aria-label="本次历史"
            value={historyIndex}
            onChange={(e) => navigateHistory(Number(e.target.value))}
          >
            <option value={-1}>当前模型</option>
            {history.map((e, i) => (
              <option key={i} value={i}>
                {i + 1}. {e.problem.title}
              </option>
            ))}
          </select>
          <button
            aria-label="下一条历史"
            disabled={historyIndex >= history.length - 1}
            onClick={() => navigateHistory(historyIndex + 1)}
          >
            ›
          </button>
          <button
            onClick={() => {
              setSettings(true);
              setModelInfo('读取模型配置…');
              void request<{ model: string; configured: boolean }>('/api/v1', '/ai/settings')
                .then((x) =>
                  setModelInfo(
                    x.configured ? '当前模型：' + x.model : '模型尚未配置，请检查服务端 .env.local',
                  ),
                )
                .catch(() => setModelInfo('无法读取模型信息；请登录后重试。'));
            }}
          >
            模型设置
          </button>
        </div>
      </header>
      <aside className="studio-import">
        <h2>1 导入单题图片</h2>
        <div
          className="studio-photo"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void upload(f);
          }}
        >
          {photo ? (
            <Image src={photo} alt="当前题目原图" width={500} height={320} unoptimized />
          ) : (
            <div>
              <span>▧</span>
              <p>拖入或粘贴一道几何题</p>
              <small>JPG / PNG / WebP · 最大 15 MB</small>
            </div>
          )}
        </div>
        <input
          ref={file}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
        <div className="studio-row">
          <button disabled={photoBusy} onClick={() => file.current?.click()}>
            选择图片
          </button>
          <button disabled={photoBusy} onClick={() => void paste()}>
            粘贴图片
          </button>
          <button
            onClick={() => {
              const e = studioExample(exampleKind);
              install({ ...e, result: validateUniversal(e.plan, e.problem) });
            }}
          >
            加载示例
          </button>
        </div>
        <select
          aria-label="示例题目"
          value={exampleKind}
          onChange={(e) => setExampleKind(e.target.value)}
        >
          <option value="cylinder">圆柱容器与两个球</option>
          <option value="hemisphere">四个相切球与半球</option>
          <option value="trajectory">矩形翻折与中点轨迹</option>
          <option value="ratio">动点折叠与距离</option>
        </select>
        <small className="studio-file">
          {photoBusy ? '正在处理图片…' : photoName || '可直接输入文字题目'}
        </small>
        <button
          className="studio-primary"
          disabled={busy || photoBusy}
          onClick={() => void generate()}
        >
          {busy ? '正在识别 / 建模…' : needsRecognition ? '识别并生成' : '生成 / 更新模型'}
        </button>
        {error && <p className="studio-import-error">{error}</p>}
        {busy && (
          <button
            onClick={() => {
              stopRequest();
              setStatus('已取消生成');
            }}
          >
            取消生成
          </button>
        )}
        <h2>2 识别出的几何关系（可修改）</h2>
        <small>修正题干、长度或垂直关系后，可重新生成</small>
        <label>
          题目文字
          <textarea
            aria-label="题目文字"
            value={problem.text}
            onChange={(e) => {
              stopRequest();
              setProblem((p) => ({ ...p, text: e.target.value }));
              setStatus('题干已修改，请同步核对条件后重新生成');
            }}
            rows={5}
          />
        </label>
        <label className="studio-conditions">
          条件 · 每行一项
          <textarea
            aria-label="几何条件"
            value={problem.conditions.join('\n')}
            onChange={(e) => editConditions(e.target.value)}
            rows={12}
          />
        </label>
        {problem.diagram?.length ? (
          <details>
            <summary>查看图示识别依据</summary>
            {problem.diagram.map((d, i) => (
              <p key={i}>
                {d.claim}：{d.evidence}
              </p>
            ))}
          </details>
        ) : null}
        {problem.uncertainties.length > 0 && (
          <details open>
            <summary>待核对条件（{problem.uncertainties.length}）</summary>
            <ul>
              {problem.uncertainties.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
            <button onClick={() => setProblem((p) => ({ ...p, uncertainties: [] }))}>
              已核对并补充条件
            </button>
          </details>
        )}
      </aside>
      <main className="studio-stage">
        <nav className="studio-toolbar" aria-label="几何构造工具">
          {(['front', 'top', 'right'] as const).map((v, i) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {['正视', '俯视', '右视'][i]}
            </button>
          ))}
          <button
            onClick={() => {
              setView('iso');
              setRevision((x) => x + 1);
            }}
          >
            视角复位
          </button>
          <button onClick={resetAll}>全部复位</button>
          <button disabled={!result} onClick={midpoint}>
            取中点
          </button>
          <button disabled={!result} onClick={connect}>
            连辅助线
          </button>
          <button disabled={!lines.length} onClick={() => setLines((old) => old.slice(0, -1))}>
            撤销辅助
          </button>
        </nav>
        <div
          className="studio-canvas"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void upload(f);
          }}
        >
          {scene && result && evaluation && transform ? (
            <CanvasBoundary key={revision}>
              <Renderer
                scene={scene}
                positions={rendered}
                constructions={lines.map((points, i) => ({ id: 'aux' + i, points }))}
                selectedPoints={selected}
                selectedLine=""
                onPoint={(id) => {
                  setSelected((old) =>
                    old.includes(id) ? old.filter((x) => x !== id) : [...old.slice(-1), id],
                  );
                }}
                onLine={() => {}}
                showBase
                showGhost={false}
                opacity={opacity / 100}
                cameraVersion={revision}
                view={view}
                theme="mint"
                compactLabels
                fontSize={fontSize}
                lineWidth={lineWidth}
                showFaces={showFaces}
                showLabels={showLabels}
                showLengths={showLengths}
                showAuxiliaries={showAux}
                occlusion={occlusion}
                locked={locked}
                selectedFace={selectedFace}
                onFace={choosingFace ? currentFace : undefined}
                segmentLengths={Object.fromEntries(
                  evaluation.scene.segments.map((s) => [
                    s.id,
                    distance(
                      evaluation.positions[s.points[0]],
                      evaluation.positions[s.points[1]],
                    ).toFixed(2),
                  ]),
                )}
                traces={trace.length ? [trace.map(transform)] : []}
                draggablePoints={
                  busy
                    ? []
                    : Object.keys(bindings).filter(
                        (id) => foldEnabled || !angleParams.some((p) => p.id === bindings[id]),
                      )
                }
                getDragPath={(id) => {
                  if (!bindings[id]) return null;
                  const path = buildPointDragPath(result.plan, values, id, bindings[id]);
                  return {
                    ...path,
                    samples: path.samples.map((s) => ({ ...s, position: transform(s.position) })),
                  };
                }}
                onPointDrag={change}
              />
            </CanvasBoundary>
          ) : (
            <div className="studio-empty">
              <span>◇</span>
              <h2>从一道题，走进一个空间</h2>
              <p>选择图片或加载示例，然后生成模型。</p>
            </div>
          )}
          <button
            className="studio-fullscreen"
            title="切换全屏"
            aria-label="切换全屏"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void root.current
                  ?.requestFullscreen()
                  .catch(() => setError('当前浏览器不支持全屏模式'));
            }}
          >
            {fullscreen ? '↙' : '↗'}
          </button>
        </div>
        <div className="studio-stage-hint">
          点击选点 · 拖动 ↔ 点名改变构型 · 左键旋转 · 右键平移 · 滚轮缩放
          {selected.length > 0 && (
            <strong>
              　已选：
              {selected.map((id) => pointOptions.find((p) => p.id === id)?.label).join('、')}
            </strong>
          )}
        </div>
      </main>
      <aside className="studio-controls">
        <section>
          <h2>显示与样式</h2>
          <div className="studio-toggles">
            {[
              [showFaces, setShowFaces, '面'],
              [showLabels, setShowLabels, '字母标注'],
              [showLengths, setShowLengths, '长度标注'],
              [showAux, setShowAux, '辅助线'],
              [occlusion, setOcclusion, '自动遮蔽线'],
            ].map(([value, setter, label]) => (
              <button
                key={label as string}
                aria-pressed={value as boolean}
                onClick={() => (setter as (v: boolean) => void)(!value)}
              >
                {label as string}
              </button>
            ))}
          </div>
          <Stepper
            label="字号"
            value={fontSize}
            min={10}
            max={24}
            step={1}
            onChange={setFontSize}
          />
          <Stepper
            label="线宽"
            value={lineWidth}
            min={0.6}
            max={4}
            step={0.2}
            onChange={setLineWidth}
          />
          <Stepper
            label="面透明度"
            value={100 - opacity}
            min={0}
            max={95}
            step={5}
            suffix="%"
            onChange={(v) => setOpacity(100 - v)}
          />
          <button className="studio-wide" onClick={() => setPalette((p) => (p + 1) % 3)}>
            配色：{paletteNames[palette]}
          </button>
        </section>
        <section>
          <h2>折叠演示</h2>
          <div className="studio-row">
            <button aria-pressed={locked} onClick={() => setLocked((v) => !v)}>
              锁定视角
            </button>
            <button
              aria-pressed={choosingFace}
              disabled={!scene?.faces.length}
              onClick={() => {
                setChoosingFace((v) => !v);
                setStatus('点击画布上的一个面进行选择');
              }}
            >
              选折叠面
            </button>
            <button
              aria-pressed={traceEnabled}
              disabled={!Object.keys(bindings).length}
              onClick={() => setTraceEnabled((v) => !v)}
            >
              选轨迹点
            </button>
          </div>
          {choosingFace && (
            <select
              aria-label="选择折叠面"
              value={selectedFace}
              onChange={(e) => currentFace(e.target.value)}
            >
              <option value="">点击画布或选择一个面</option>
              {scene?.faces.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.vertices
                    .map((id) => pointOptions.find((p) => p.id === id)?.label ?? id)
                    .join('–')}
                </option>
              ))}
            </select>
          )}
          {traceEnabled && (
            <select
              aria-label="轨迹点"
              value={tracePoint || result?.plan.trace?.point || Object.keys(bindings)[0]}
              onChange={(e) => setTracePoint(e.target.value)}
            >
              {pointOptions
                .filter((p) => bindings[p.id])
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} 的轨迹
                  </option>
                ))}
            </select>
          )}
          {angleParams.length > 1 && (
            <select
              aria-label="折叠参数"
              value={fold?.id}
              onChange={(e) => {
                setPlaying(false);
                setFoldParameter(e.target.value);
              }}
            >
              {angleParams.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          <div className="studio-angle">
            <span>折叠角度</span>
            <output>
              {fold ? (((values[fold.id] ?? fold.initial) * 180) / Math.PI).toFixed(1) : '0.0'}°
            </output>
          </div>
          <input
            aria-label="折叠角度"
            type="range"
            min={0}
            max={200}
            step={1}
            disabled={!fold || !foldEnabled || busy}
            value={
              fold
                ? Math.round(
                    (((values[fold.id] ?? fold.initial) - fold.min) / (fold.max - fold.min)) * 200,
                  )
                : 0
            }
            onChange={(e) => {
              if (fold) {
                setPlaying(false);
                change(fold.id, fold.min + ((fold.max - fold.min) * Number(e.target.value)) / 200);
              }
            }}
          />
          {!fold && <small>当前为固定构型。选面及两个顶点后可建立折痕。</small>}
          {selectedFace && (
            <>
              <small>选中面：{selectedFace}</small>
              <button
                disabled={selected.length !== 2}
                onClick={() => {
                  if (result)
                    try {
                      const p = addFaceFold(
                        result.plan,
                        selectedFace,
                        selected as [string, string],
                      );
                      applyPlan(p);
                      setFoldParameter(p.parameters.at(-1)!.id);
                      setFoldEnabled(true);
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                }}
              >
                用选中两点建立折痕
              </button>
            </>
          )}
          <div className="studio-row">
            <button disabled={!fold || !foldEnabled} onClick={() => setPlaying((p) => !p)}>
              {playing ? '暂停演示' : '播放演示'}
            </button>
            <button
              disabled={!fold}
              onClick={() => {
                setPlaying(false);
                setFoldEnabled(true);
                if (fold) change(fold.id, fold.min);
              }}
            >
              展开复位
            </button>
            <button
              disabled={!fold}
              onClick={() => {
                setPlaying(false);
                if (fold) change(fold.id, fold.min);
                setFoldEnabled(false);
                setTraceEnabled(false);
              }}
            >
              清除折叠
            </button>
          </div>
          {!foldEnabled && fold && <button onClick={() => setFoldEnabled(true)}>启用折叠</button>}
          {parameters
            .filter((p) => p.unit !== 'rad')
            .map((p) => (
              <label key={p.id} className="studio-parameter">
                <span>
                  {p.label}
                  <output>{(values[p.id] ?? p.initial).toFixed(3)}</output>
                </span>
                <input
                  type="range"
                  aria-label={p.label}
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(
                    (((values[p.id] ?? p.initial) - p.min) / (p.max - p.min)) * 200,
                  )}
                  onChange={(e) =>
                    change(p.id, p.min + ((p.max - p.min) * Number(e.target.value)) / 200)
                  }
                />
              </label>
            ))}
        </section>
        <section>
          <h2>动态测量</h2>
          <select
            aria-label="测量类型"
            value={kind}
            onChange={(e) => setKind(e.target.value as Observation['kind'])}
          >
            {Object.entries(titles).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
          <div className="studio-measure-points">
            {Array.from({ length: required }, (_, i) => (
              <select
                key={i}
                aria-label={'测量点' + (i + 1)}
                value={measurePoints[i] || pointOptions[i]?.id || ''}
                onChange={(e) =>
                  setMeasurePoints((old) => old.map((v, j) => (j === i ? e.target.value : v)))
                }
              >
                {!pointOptions.length && <option value="">无点</option>}
                {pointOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            ))}
          </div>
          <small>
            {kind === 'height'
              ? '第1点到其余3点确定的平面'
              : kind === 'point_line'
                ? '第1点到后2点确定的直线'
                : kind === 'line_angle'
                  ? '前2点、后2点分别确定两条直线'
                  : '选择线段的两个端点'}
          </small>
          <div className="studio-row">
            <button disabled={!evaluation} onClick={addObservation}>
              添加观察
            </button>
            <button
              disabled={!observationId}
              onClick={() => {
                setObservations((old) => old.filter((o) => o.id !== observationId));
                setObservationId('');
              }}
            >
              删除选中
            </button>
            <button
              disabled={!observations.length}
              onClick={() => {
                setObservations([]);
                setObservationId('');
              }}
            >
              清空
            </button>
          </div>
          <div className="studio-observations" role="listbox" aria-label="测量记录">
            {observations.map((o) => (
              <button
                role="option"
                aria-selected={o.id === observationId}
                key={o.id}
                onClick={() => setObservationId(o.id)}
              >
                {titles[o.kind]}{' '}
                {o.points.map((id) => pointOptions.find((p) => p.id === id)?.label ?? id).join('–')}
                <strong>{evaluation ? measureObservation(o, evaluation.positions) : '—'}</strong>
              </button>
            ))}
            {!observations.length && <small>选择点后添加观察，数值随模型变化。</small>}
          </div>
          {evaluation &&
            Object.entries(evaluation.metrics).map(([id, m]) => (
              <p className="studio-metric" key={id}>
                {result?.plan.metrics.find((x) => x.id === id)?.label}
                <strong>{m.value?.toFixed(4) ?? m.reason}</strong>
              </p>
            ))}
          {traceEnabled && trace.length > 0 && (
            <p className="studio-metric" data-testid="trace-length">
              轨迹采样长度<strong>{traceLength.toFixed(5)}</strong>
            </p>
          )}
        </section>
        {result && (
          <details className="studio-validation">
            <summary>构造检查 · {result.samples} 组参数</summary>
            <p>{result.verification}</p>
            {result.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
            <p>{result.plan.reason}</p>
          </details>
        )}
      </aside>
      <footer className="studio-footer">
        <strong>操作提示</strong>
        <span role={error ? 'alert' : 'status'} className={error ? 'studio-error' : ''}>
          {error || status}
        </span>
        <span>{problem.title}</span>
      </footer>
      {settings && (
        <div className="studio-modal-backdrop">
          <section
            className="studio-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-settings-title"
          >
            <h2 id="studio-settings-title">模型设置与能力</h2>
            <p>{modelInfo}</p>
            <p>模型连接使用服务端配置，密钥不会发送到浏览器。</p>
            <p>
              支持多面体、球、圆柱与朝 +Z 的半球；生成结果须通过几何检查，不能保证所有题目都可建模。
            </p>
            <label>
              条件覆盖策略
              <select
                aria-label="条件覆盖策略"
                value={strictCoverage ? 'strict' : 'explore'}
                onChange={(e) => setStrictCoverage(e.target.value === 'strict')}
              >
                <option value="explore">探索模式：保留未覆盖条件的提示</option>
                <option value="strict">严格模式：未覆盖条件时拒绝显示</option>
              </select>
            </label>
            <label>
              默认示例
              <select value={exampleKind} onChange={(e) => setExampleKind(e.target.value)}>
                <option value="cylinder">圆柱与球</option>
                <option value="hemisphere">半球与四球</option>
                <option value="trajectory">折叠轨迹</option>
                <option value="ratio">动点折叠</option>
              </select>
            </label>
            <button className="studio-primary" autoFocus onClick={() => setSettings(false)}>
              完成
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
