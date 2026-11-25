'use client';

import Link from 'next/link';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { useSession } from '@/features/auth/session';
import { useResource } from '@/shared/api/use-resource';
import {
  STUDY_RETURN_PARAM,
  UPLOAD_TOPIC_LIMIT,
  UPLOAD_TOPIC_PARAM,
  studyReturnHref,
} from '@/shared/api/knowledge-tags';
import { readStudyReturn } from '@/features/study/study-return';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/common';
import {
  ancestors,
  backgroundLayout,
  graphFocus,
  questionsForNode,
  radialLayout,
  uploadTopicPaths,
  validateStructure,
  type GraphStructure,
} from './graph-model';
import { loadGraphStructure } from './structure';
import { KnowledgeChat } from './knowledge-chat';
import { KnowledgePanel } from './knowledge-panel';
import { TopicPaths } from './topic-paths';

function observeFocus(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener('zhixu:graph-focus', listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('zhixu:graph-focus', listener);
  };
}
function readLocation() {
  return window.location.search;
}

export function KnowledgeMap({ initialQuery }: { initialQuery: string }) {
  const { api } = useSession();
  const read = useCallback(
    async (signal: AbortSignal) =>
      validateStructure(await loadGraphStructure(api.publishedGraphQuestions, signal)),
    [api],
  );
  const state = useResource(read);
  if (state.loading) return <LoadingState text="正在整理知识结构…" />;
  if (state.error) return <ErrorState message={state.error} retry={state.retry} />;
  if (!state.data?.nodes.length)
    return (
      <EmptyState title="知识目录尚未准备好">知识内容接入后，可从这里探索上下层关系。</EmptyState>
    );
  return <GraphWorkspace data={state.data} initialQuery={initialQuery} />;
}
function GraphWorkspace({ data, initialQuery }: { data: GraphStructure; initialQuery: string }) {
  const root = data.nodes.find((node) => node.parentId === null)!;
  const location = useSyncExternalStore(observeFocus, readLocation, () => initialQuery);
  const query = new URLSearchParams(location);
  const { user } = useSession();
  const studyReturn = query.get(STUDY_RETURN_PARAM);
  const returnHref =
    studyReturn && readStudyReturn(user?.id, studyReturn) ? studyReturnHref(studyReturn) : null;
  const questionId = query.get('question');
  const codes = query.getAll(UPLOAD_TOPIC_PARAM).slice(0, UPLOAD_TOPIC_LIMIT);
  const topicPaths = uploadTopicPaths(data.nodes, codes);
  const firstTopic = topicPaths.nodes.find((node) => topicPaths.leafIds.has(node.id));
  const requestedNode = query.get('node') ?? firstTopic?.parentId ?? null;
  const focus = graphFocus(data, requestedNode, questionId);
  const focusId = focus.id;
  const questions = questionsForNode(data, focusId);
  const currentQuestion = questions.find((question) => question.id === questionId) ?? questions[0];
  const [showQuestions, setShowQuestions] = useState(false);
  const uploadActive = codes.length > 0 && !showQuestions;
  const relatedTags = new Set(uploadActive ? [] : (currentQuestion?.knowledgeIds ?? []));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 850, height: 650 });
  const [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(focusId);
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(
    null,
  );

  const layout = radialLayout(data.nodes, focusId);
  const path = ancestors(data.nodes, focusId);
  const fitScale = Math.max(
    0.1,
    Math.min((size.width - 40) / layout.extent, (size.height - 40) / layout.extent, 1.15),
  );
  const scale = fitScale * zoom;
  const background = useMemo(() => backgroundLayout(data.nodes), [data.nodes]);
  const backgroundFocus = background.get(focusId)!;

  useLayoutEffect(() => {
    const oldFocus = previousFocus.current;
    previousFocus.current = focusId;
    if (oldFocus === focusId || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;

    const moves = [
      [focusId, -34],
      [oldFocus, 27],
    ] as const;
    const animations = moves.map(([id, shift]) =>
      world.current
        ?.querySelector(`.km-node[data-node-id="${CSS.escape(id)}"]`)
        ?.animate([{ top: '0px' }, { top: `${shift}px`, offset: 0.58 }, { top: '0px' }], {
          duration: 650,
          easing: 'ease-in-out',
        }),
    );
    return () => animations.forEach((animation) => animation?.cancel());
  }, [focusId]);
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
  function updateLocation(
    id: string,
    question: string | null,
    moveNode: boolean,
    clearTopics = false,
  ) {
    const url = new URL(window.location.href);
    url.searchParams.set('node', id);
    if (clearTopics) {
      url.searchParams.delete(UPLOAD_TOPIC_PARAM);
      setShowQuestions(false);
    }
    if (question) url.searchParams.set('question', question);
    else url.searchParams.delete('question');
    if (moveNode) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
    window.dispatchEvent(new Event('zhixu:graph-focus'));
  }
  function select(id: string, question: string | null = null) {
    if (id === focusId && questionId === question) return;
    setPan({ x: 0, y: 0 });
    setZoom(1);
    updateLocation(id, question, id !== focusId);
  }
  function selectUploadTopic(id: string) {
    select(id);
    if (window.matchMedia('(max-width: 760px)').matches)
      viewport.current?.scrollIntoView({ block: 'start' });
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
          <div className="km-heading-actions">
            {returnHref && (
              <Link className="btn small" href={returnHref} scroll={false}>
                返回拍照学题
              </Link>
            )}
            <button
              className="btn small"
              onClick={() => {
                if (codes.length) updateLocation(focusId, questionId, true, true);
                else select(root.id);
                resetView();
              }}
            >
              {codes.length ? '退出定位' : '回到总览'}
            </button>
          </div>
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
            ref={world}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            }}
          >
            {data.nodes
              .filter((node) => node.parentId)
              .map((node, index) => {
                const from = layout.points.get(node.parentId!);
                const to = layout.points.get(node.id);
                const visible =
                  !!from && !!to && (node.id === focusId || node.parentId === focusId);
                const x = from?.x ?? 0,
                  y = from?.y ?? 0;
                const dx = (to?.x ?? 0) - x,
                  dy = (to?.y ?? 0) - y;
                const angle = Math.atan2(dy, dx);
                // Draw both bends in the visible gap, with each end tucked under its bubble.
                const startInset = node.id === focusId ? 47 : 82;
                const gap = Math.max(0, Math.hypot(dx, dy) - 82 - 47);
                const startX = x + Math.cos(angle) * startInset;
                const startY = y + Math.sin(angle) * startInset;
                const bend = index % 2 ? -14 : 14;
                const onUploadPath =
                  topicPaths.nodeIds.has(node.parentId!) && topicPaths.nodeIds.has(node.id);
                return (
                  <svg
                    key={'edge-' + node.id}
                    className={'km-edge' + (onUploadPath ? ' is-upload' : '')}
                    viewBox="0 -50 100 100"
                    aria-hidden="true"
                    style={{
                      opacity: visible ? 1 : 0,
                      transform: `translate(${startX}px, ${startY}px) rotate(${angle}rad) scaleX(${gap / 100})`,
                    }}
                  >
                    <path
                      d={`M 0 0 C 17 ${-bend} 33 ${-bend} 50 0 C 67 ${bend} 83 ${bend} 100 0`}
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                );
              })}
            {data.nodes.map((node, index) => {
              const point = layout.points.get(node.id);
              const position = background.get(node.id)!;
              const x =
                point?.x ?? (position.x - backgroundFocus.x) * (size.width / fitScale) * 0.45;
              const y =
                point?.y ?? (position.y - backgroundFocus.y) * (size.height / fitScale) * 0.43;
              const central = node.id === focusId;
              const nodeScale = point ? (central ? 1 : 0.64) : 0.05 + ((index * 7) % 11) * 0.007;
              // Compensate for the graph and node scales so even small bubbles visibly float.
              const floatShift = (point ? (central ? 8 : 6.5) : 3.5) / (nodeScale * fitScale);
              const parent = node.id === focus.parentId;
              const uploadKind = topicPaths.leafIds.has(node.id)
                ? 'match'
                : topicPaths.nodeIds.has(node.id)
                  ? 'ancestor'
                  : undefined;
              const uploadMark =
                uploadKind === 'match' ? '上传题知识点' : uploadKind ? '上传题路径' : '';
              const related =
                !central &&
                !uploadMark &&
                node.kind === 'point' &&
                relatedTags.has(node.code ?? '');
              return (
                <button
                  key={node.id}
                  data-node-id={node.id}
                  data-node-kind={node.kind}
                  data-upload-kind={uploadKind}
                  title={point ? node.label : undefined}
                  className={
                    'km-node' +
                    (central ? ' is-center' : '') +
                    (parent ? ' is-parent' : '') +
                    (related ? ' is-related' : '') +
                    (!point ? ' is-background' : '')
                  }
                  aria-label={
                    point
                      ? `${node.label}，${central ? '当前节点' : parent ? '切换到上级' : '切换到下级'}${related ? '，当前题目关联' : ''}${uploadMark ? '，' + uploadMark : ''}`
                      : undefined
                  }
                  aria-current={central ? 'true' : undefined}
                  aria-hidden={!point}
                  tabIndex={point ? 0 : -1}
                  disabled={!point}
                  onClick={() =>
                    !central && select(node.id, related ? currentQuestion?.id : undefined)
                  }
                  style={
                    {
                      '--node-x': `${x}px`,
                      '--node-y': `${y}px`,
                      '--node-scale': nodeScale,
                      '--float-shift': `${floatShift}px`,
                      '--float-duration': `${4.8 + (index % 6) * 0.5}s`,
                      '--float-delay': `${-(index % 9) * 0.63}s`,
                      '--node-font':
                        node.label.length > 24 ? '18px' : node.label.length > 16 ? '21px' : '23px',
                    } as CSSProperties
                  }
                >
                  <span className="km-bubble">
                    {point && (
                      <>
                        <span className="km-node-role">
                          {uploadMark ||
                            (central
                              ? '当前节点'
                              : parent
                                ? '上级'
                                : related
                                  ? '关联下级'
                                  : '下级')}
                        </span>
                        <strong>{node.label}</strong>
                        <span className="km-node-hint">
                          {central
                            ? layout.children.length
                              ? `${layout.children.length} 个下级节点`
                              : '末级节点'
                            : '点击切换中心'}
                        </span>
                      </>
                    )}
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
          <p>
            大圆：当前节点 · 浅蓝：上级 · 浅紫：下级 · 小泡泡：其他节点
            {firstTopic && <span className="km-upload-key">青绿：上传题知识点及上级</span>}
          </p>
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
        <KnowledgePanel
          data={data}
          focus={focus}
          questions={questions}
          select={select}
          questionId={questionId}
          selectQuestion={(id) => updateLocation(focusId, id, false)}
          upload={
            codes.length > 0
              ? {
                  active: uploadActive,
                  onChange: (active) => setShowQuestions(!active),
                  content: (
                    <TopicPaths
                      nodes={topicPaths.nodes}
                      leafIds={topicPaths.leafIds}
                      partial={topicPaths.partial}
                      focusId={focusId}
                      select={selectUploadTopic}
                    />
                  ),
                }
              : undefined
          }
        />
        <KnowledgeChat key={'chat:' + focusId} focus={focus} question={currentQuestion} />
      </aside>
    </div>
  );
}
