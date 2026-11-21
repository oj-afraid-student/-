'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { useResource } from '@/shared/api/use-resource';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/common';
import { ancestors, radialLayout, validateStructure, type GraphStructure } from './graph-model';
import { loadGraphStructure } from './structure';
import { KnowledgePanel } from './knowledge-panel';

function observeFocus(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener('zhixu:graph-focus', listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('zhixu:graph-focus', listener);
  };
}
function readFocus() {
  return new URLSearchParams(window.location.search).get('node');
}

export function KnowledgeMap({
  initialId,
  loader = loadGraphStructure,
}: {
  initialId?: string;
  loader?: (signal: AbortSignal) => Promise<GraphStructure>;
}) {
  const read = useCallback(
    async (signal: AbortSignal) => validateStructure(await loader(signal)),
    [loader],
  );
  const state = useResource(read);
  if (state.loading) return <LoadingState text="正在整理知识结构…" />;
  if (state.error) return <ErrorState message={state.error} retry={state.retry} />;
  if (!state.data?.nodes.length)
    return (
      <EmptyState title="知识目录尚未准备好">知识内容接入后，可从这里探索上下层关系。</EmptyState>
    );
  return <GraphWorkspace data={state.data} initialId={initialId} />;
}
function GraphWorkspace({ data, initialId }: { data: GraphStructure; initialId?: string }) {
  const root = data.nodes.find((node) => node.parentId === null)!;
  const requestedId = useSyncExternalStore(observeFocus, readFocus, () => initialId ?? null);
  const focusId = data.nodes.some((node) => node.id === requestedId) ? requestedId! : root.id;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 850, height: 650 });
  const [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(
    null,
  );
  const focus = data.nodes.find((node) => node.id === focusId)!;
  const layout = radialLayout(data.nodes, focusId);
  const path = ancestors(data.nodes, focusId);
  const scale =
    Math.min((size.width - 40) / layout.extent, (size.height - 40) / layout.extent, 1.15) * zoom;
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const back = () => {
      setPan({ x: 0, y: 0 });
      setZoom(1);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  function select(id: string) {
    if (id === focusId) return;
    setPan({ x: 0, y: 0 });
    setZoom(1);
    const url = new URL(window.location.href);
    url.searchParams.set('node', id);
    window.history.pushState(null, '', url.pathname + url.search);
    window.dispatchEvent(new Event('zhixu:graph-focus'));
  }
  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  return (
    <div className="km-workspace">
      <section className="km-graph" aria-label="知识图谱">
        <header className="km-heading">
          <div>
            <h1>知识图谱</h1>
            <p>点击节点，探索上下层关系</p>
          </div>
          <button
            className="btn small"
            onClick={() => {
              select(root.id);
              resetView();
            }}
          >
            回到总览
          </button>
        </header>
        <nav className="km-breadcrumb" aria-label="当前知识路径">
          {path.map((node, index) => (
            <span key={node.id}>
              {index > 0 && <span aria-hidden="true">›</span>}
              <button
                onClick={() => select(node.id)}
                aria-current={node.id === focusId ? 'location' : undefined}
              >
                {node.label}
              </button>
            </span>
          ))}
        </nav>
        {data.placeholder && (
          <p className="km-placeholder">
            <span />
            结构预览 · 知识内容待接入
          </p>
        )}
        <div
          className={'km-viewport' + (dragging ? ' is-dragging' : '')}
          ref={viewport}
          aria-label="可平移的知识网络"
          onPointerDown={(event) => {
            if (event.button !== 0 || (event.target as HTMLElement).closest('button,a')) return;
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              startX: pan.x,
              startY: pan.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const origin = drag.current;
            if (origin?.id === event.pointerId)
              setPan({
                x: origin.startX + event.clientX - origin.x,
                y: origin.startY + event.clientY - origin.y,
              });
          }}
          onPointerUp={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
        >
          <div
            className="km-world"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${Math.max(0.1, scale)})`,
            }}
          >
            {data.nodes
              .filter((node) => node.parentId)
              .map((node) => {
                const from = layout.points.get(node.parentId!);
                const to = layout.points.get(node.id);
                const visible =
                  !!from && !!to && (node.id === focusId || node.parentId === focusId);
                const x = from?.x ?? 0,
                  y = from?.y ?? 0;
                const dx = (to?.x ?? 0) - x,
                  dy = (to?.y ?? 0) - y;
                return (
                  <div
                    key={'edge-' + node.id}
                    className="km-edge"
                    aria-hidden="true"
                    style={{
                      opacity: visible ? 1 : 0,
                      visibility: visible ? 'visible' : 'hidden',
                      width: Math.hypot(dx, dy),
                      transform: `translate(${x}px, ${y}px) rotate(${Math.atan2(dy, dx)}rad)`,
                    }}
                  />
                );
              })}
            {data.nodes.map((node) => {
              const point = layout.points.get(node.id);
              const central = node.id === focusId;
              const parent = node.id === focus.parentId;
              return (
                <button
                  key={node.id}
                  data-node-id={node.id}
                  title={node.label}
                  className={
                    'km-node' + (central ? ' is-center' : '') + (parent ? ' is-parent' : '')
                  }
                  aria-label={`${node.label}，${central ? '当前节点' : parent ? '切换到上级' : '切换到下级'}`}
                  aria-current={central ? 'true' : undefined}
                  aria-hidden={!point}
                  tabIndex={point ? 0 : -1}
                  disabled={!point}
                  onClick={() => select(node.id)}
                  style={
                    {
                      '--node-x': `${point?.x ?? 0}px`,
                      '--node-y': `${point?.y ?? 0}px`,
                      '--node-scale': central ? 1 : 0.64,
                      '--node-font':
                        node.label.length > 24 ? '18px' : node.label.length > 16 ? '21px' : '23px',
                      opacity: point ? 1 : 0,
                      visibility: point ? 'visible' : 'hidden',
                      pointerEvents: point ? 'auto' : 'none',
                    } as CSSProperties
                  }
                >
                  <span className="km-node-role">
                    {central ? '当前节点' : parent ? '上级' : '下级'}
                  </span>
                  <strong>{node.label}</strong>
                  <span className="km-node-hint">
                    {central
                      ? layout.children.length
                        ? `${layout.children.length} 个下级节点`
                        : '末级节点'
                      : '点击切换中心'}
                  </span>
                </button>
              );
            })}
          </div>
          {!layout.children.length && (
            <p className="km-leaf-note">已到达当前分支末级，可点击上级返回。</p>
          )}
        </div>
        <footer className="km-toolbar">
          <p>大圆：当前节点 · 小圆：相邻层级</p>
          <span>点击切换 · 拖动平移</span>
          <div className="km-zoom">
            <button
              aria-label="缩小图谱"
              disabled={zoom <= 0.55}
              onClick={() => setZoom((value) => Math.max(0.55, value - 0.15))}
            >
              −
            </button>
            <output aria-label="图谱缩放比例">{Math.round(zoom * 100)}%</output>
            <button
              aria-label="放大图谱"
              disabled={zoom >= 1.75}
              onClick={() => setZoom((value) => Math.min(1.75, value + 0.15))}
            >
              ＋
            </button>
            <button aria-label="复位视图" title="复位视图" onClick={resetView}>
              ⛶
            </button>
          </div>
        </footer>
      </section>
      <aside className="km-right" aria-label="关联题目与学习助手">
        <KnowledgePanel key={focusId} data={data} focus={focus} select={select} />
        <section className="km-chat" aria-label="AI 对话预留区">
          <header>
            <h2>
              <span aria-hidden="true">✧</span> AI 学习助手
            </h2>
            <span className="tag">预留</span>
          </header>
          <div className="km-chat-context">
            <span>当前知识点</span>
            <span>当前题目</span>
          </div>
          <p>选中知识点或题目后，在这里提问。</p>
          <div className="km-chat-input">
            <textarea aria-label="AI 提问（待接入）" placeholder="输入你的问题…" disabled />
            <button aria-label="发送问题（待接入）" disabled>
              ↑
            </button>
          </div>
          <small>对话功能待接入</small>
        </section>
      </aside>
    </div>
  );
}
