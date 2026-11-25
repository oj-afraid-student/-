'use client';

import {
  useEffect,
  useState,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
  type ComponentRef,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  GreaterDepth,
  Vector3,
  OrthographicCamera,
} from 'three';
import type { Construction, GeometryScene, Positions, Vec3 } from './scene';
import { initialPositions } from './constraints';
import { SolidRenderer } from './solid-renderer';
import { projectToPlane } from './geometry';
import { nearestDragSample, type PointDragPath } from './point-drag';

function Face({
  vertices,
  color,
  opacity,
  onSelect,
}: {
  vertices: Vec3[];
  color: string;
  opacity: number;
  onSelect?: () => void;
}) {
  const geometry = useMemo(() => {
    const values: number[] = [];
    for (let i = 1; i < vertices.length - 1; i++)
      values.push(...vertices[0], ...vertices[i], ...vertices[i + 1]);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(values, 3));
    g.computeVertexNormals();
    return g;
  }, [vertices]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      renderOrder={0}
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
    >
      <meshBasicMaterial
        color={color}
        side={DoubleSide}
        transparent
        opacity={opacity}
        depthWrite
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
  );
}
function Edge({
  points,
  color,
  selected,
  onSelect,
  width = 1.4,
  occlusion = true,
}: {
  points: Vec3[];
  color: string;
  selected?: boolean;
  onSelect?: () => void;
  width?: number;
  occlusion?: boolean;
}) {
  return (
    <>
      <Line
        points={points}
        color={color}
        lineWidth={selected ? width + 1.6 : width}
        depthTest={occlusion}
        renderOrder={2}
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          onSelect?.();
        }}
      />
      {occlusion && (
        <Line
          points={points}
          color={color}
          lineWidth={width}
          dashed
          dashSize={0.12}
          gapSize={0.09}
          depthFunc={GreaterDepth}
          depthWrite={false}
          renderOrder={3}
        />
      )}
    </>
  );
}
// Labels live in the existing DOM React root, avoiding nested Html roots during StrictMode.
function ProjectLabels({
  positions,
  elements,
}: {
  positions: Positions;
  elements: RefObject<Record<string, HTMLElement | null>>;
}) {
  const projected = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const occupied: { x: number; y: number; width: number }[] = [];
    for (const [id, point] of Object.entries(positions)) {
      const element = elements.current[id];
      if (!element) continue;
      projected.set(...point).project(camera);
      element.style.setProperty('visibility', Math.abs(projected.z) <= 1 ? 'visible' : 'hidden');
      const x = ((projected.x + 1) * size.width) / 2;
      let y = ((1 - projected.y) * size.height) / 2 - 8;
      const width = element.offsetWidth;
      // Coincident endpoints (P=F, P=A) must retain both point names.
      while (
        occupied.some(
          (p) => Math.abs(p.x - x) < (p.width + width) / 2 + 3 && Math.abs(p.y - y) < 28,
        )
      )
        y -= 28;
      occupied.push({ x, y, width });
      element.style.setProperty('transform', `translate(-50%, -100%) translate(${x}px, ${y}px)`);
    }
  });
  return null;
}
function CameraRig({
  view,
  version,
  dragging,
  studio,
}: {
  view: 'iso' | 'top' | 'front' | 'right';
  version: number;
  dragging: boolean;
  studio?: boolean;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  // Synchronize the external Three.js camera before paint; this is not React state.
  /* eslint-disable react-hooks/immutability */
  useLayoutEffect(() => {
    const position: Vec3 =
      view === 'top'
        ? [2, 2, 14]
        : view === 'front'
          ? [2, -12, 0.6]
          : view === 'right'
            ? [14, 2, 0.6]
            : [9, -10, 9];
    camera.position.set(...position);
    camera.up.set(0, 0, 1);
    if (camera instanceof OrthographicCamera) {
      camera.zoom = Math.min(
        studio ? 95 : 65,
        Math.max(25, (size.width - 70) / 5.7),
        (size.height - 70) / 5.7,
      );
      camera.updateProjectionMatrix();
    }
    controls.current?.target.set(2, 2, 0.6);
    controls.current?.update();
    invalidate();
  }, [camera, size.width, size.height, invalidate, view, version, studio]);
  /* eslint-enable react-hooks/immutability */
  return (
    <OrbitControls
      enabled={!dragging}
      ref={controls}
      makeDefault
      target={[2, 2, 0.6]}
      minZoom={25}
      maxZoom={180}
    />
  );
}
function ProjectionBridge({
  projectRef,
}: {
  projectRef: RefObject<((p: Vec3) => { x: number; y: number }) | null>;
}) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    projectRef.current = (p) => {
      const v = new Vector3(...p).project(camera);
      return { x: ((v.x + 1) * size.width) / 2, y: ((1 - v.y) * size.height) / 2 };
    };
    return () => {
      projectRef.current = null;
    };
  }, [camera, size, projectRef]);
  return null;
}
type Props = {
  showFaces?: boolean;
  showLabels?: boolean;
  showLengths?: boolean;
  showAuxiliaries?: boolean;
  occlusion?: boolean;
  lineWidth?: number;
  fontSize?: number;
  locked?: boolean;
  compactLabels?: boolean;
  selectedFace?: string;
  onFace?: (id: string) => void;
  segmentLengths?: Record<string, string>;
  theme?: 'mint' | 'original';
  draggablePoints?: string[];
  getDragPath?: (point: string) => PointDragPath | null;
  onPointDrag?: (parameter: string, value: number) => void;
  traces?: Vec3[][];
  scene: GeometryScene;
  positions: Positions;
  constructions: Construction[];
  selectedPoints: string[];
  selectedLine: string;
  onPoint: (id: string) => void;
  onLine: (id: string) => void;
  showBase: boolean;
  showGhost: boolean;
  opacity: number;
  cameraVersion: number;
  view: 'iso' | 'top' | 'front' | 'right';
};
export default function SceneRenderer(props: Props) {
  const {
    scene,
    positions: p,
    constructions,
    selectedPoints,
    selectedLine,
    onPoint,
    onLine,
    showBase,
    showGhost,
    opacity,
    cameraVersion,
    view,
  } = props;
  const [dragging, setDragging] = useState(false);
  const projectRef = useRef<((p: Vec3) => { x: number; y: number }) | null>(null);
  const drag = useRef<{
    id: string;
    pointer: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    parameter: string;
    current: number;
    samples: { x: number; y: number; value: number }[];
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const lineWidth = props.lineWidth ?? 1.4;
  const lengthLabels = Object.fromEntries(
    scene.segments.map((s) => [
      'length_' + s.id,
      s.points
        .map((id) => p[id])
        .reduce((a, b) => a.map((v, i) => v + b[i] / 2) as Vec3, [0, 0, 0] as Vec3),
    ]),
  );
  const mint = props.theme === 'mint';
  const elements = useRef<Record<string, HTMLElement | null>>({});
  const initial = initialPositions(scene);
  const h = scene.id === 'square-fold' ? projectToPlane(p.A, p.B, p.C, p.D) : null;
  return (
    <div
      className={`geo-renderer ${mint ? 'geo-mint' : ''} ${props.compactLabels ? 'geo-compact-labels' : ''}`}
      style={{ fontSize: props.fontSize ?? 14 }}
    >
      <Canvas
        orthographic
        camera={{ position: [9, -10, 9], zoom: 65, up: [0, 0, 1], near: 0.1, far: 100 }}
        frameloop="demand"
        dpr={[1, 2]}
        fallback={
          <p role="alert">
            此浏览器无法创建 WebGL 场景，请启用硬件加速或更换浏览器。参数与量测仍可使用。
          </p>
        }
      >
        {!mint && <color attach="background" args={['#f5f7f3']} />}
        <ProjectionBridge projectRef={projectRef} />
        <CameraRig
          view={view}
          version={cameraVersion}
          dragging={dragging || !!props.locked}
          studio={props.compactLabels}
        />
        <ambientLight intensity={1.8} />
        <directionalLight position={[4, -5, 10]} intensity={1.3} />
        {scene.solids?.map((s) => (
          <SolidRenderer
            key={s.id}
            solid={s}
            positions={p}
            opacity={opacity}
            showFaces={props.showFaces !== false}
            lineWidth={lineWidth}
          />
        ))}
        {props.traces?.map((points, i) => (
          <Line
            key={'trace' + i}
            points={points}
            color={mint ? '#8866bb' : '#b7518d'}
            lineWidth={mint ? 1.5 : 2}
          />
        ))}
        {scene.faces
          .filter((f) => props.showFaces !== false && (showBase || f.id !== 'base'))
          .map((f) => (
            <Face
              key={f.id}
              vertices={f.vertices.map((id) => p[id])}
              color={mint ? (f.color === '#d99b4e' ? '#77c9ca' : '#70acce') : f.color}
              opacity={opacity}
              onSelect={props.onFace ? () => props.onFace!(f.id) : undefined}
            />
          ))}
        {props.selectedFace &&
          scene.faces
            .filter((f) => f.id === props.selectedFace)
            .map((f) => (
              <Line
                key={'selected' + f.id}
                points={[...f.vertices, f.vertices[0]].map((id) => p[id])}
                color="#ba7698"
                lineWidth={lineWidth + 2}
                depthTest={false}
              />
            ))}
        {showGhost && scene.id === 'square-fold' && (
          <Line
            points={['A', 'E', 'D', 'A'].map((id) => initial[id])}
            color="#85958d"
            dashed
            dashSize={0.12}
            gapSize={0.08}
            depthTest={false}
            renderOrder={4}
          />
        )}
        {scene.segments.map((s) => (
          <Edge
            key={s.id}
            width={lineWidth}
            occlusion={props.occlusion !== false}
            points={s.points.map((id) => p[id])}
            color={mint ? '#425e69' : s.id === 'DE' ? '#b47720' : '#47796e'}
            selected={selectedLine === s.id}
            onSelect={() => onLine(s.id)}
          />
        ))}
        {(props.showAuxiliaries === false ? [] : constructions).map((s) => (
          <Edge
            key={s.id}
            width={lineWidth}
            occlusion={props.occlusion !== false}
            points={s.points.map((id) => p[id])}
            color="#a35394"
            selected={selectedLine === s.id}
            onSelect={() => onLine(s.id)}
          />
        ))}
        {h && (
          <Line
            points={[p.A, h]}
            color="#657ab2"
            dashed
            dashSize={0.1}
            gapSize={0.07}
            depthTest={false}
          />
        )}
        {scene.points.map((point) => (
          <group key={point.id} position={p[point.id]}>
            <mesh
              renderOrder={5}
              onClick={(e) => {
                if (e.delta > 4) return;
                e.stopPropagation();
                onPoint(point.id);
              }}
            >
              <sphereGeometry args={[props.compactLabels ? 0.025 : 0.075, 16, 12]} />
              <meshBasicMaterial
                color={selectedPoints.includes(point.id) ? '#8866bb' : mint ? '#3a6978' : '#285d52'}
                depthTest={false}
              />
            </mesh>
          </group>
        ))}
        <ProjectLabels
          positions={{
            ...p,
            ...(props.showLengths ? lengthLabels : {}),
            ...(h ? { ghost: initial.A, foot: h } : {}),
          }}
          elements={elements}
        />
      </Canvas>
      <div className="geo-label-layer">
        {props.showLengths &&
          scene.segments.map((s) => (
            <span
              className="geo-length-label"
              key={s.id}
              ref={(el) => {
                elements.current['length_' + s.id] = el;
              }}
            >
              {props.segmentLengths?.[s.id] ?? ''}
            </span>
          ))}
        {props.showLabels !== false &&
          scene.points.map((point) => (
            <button
              key={point.id}
              ref={(element) => {
                elements.current[point.id] = element;
              }}
              className={`geo-point ${selectedPoints.includes(point.id) ? 'selected' : ''} ${props.draggablePoints?.includes(point.id) ? 'draggable' : ''}`}
              title={
                props.draggablePoints?.includes(point.id)
                  ? '拖动点名沿题设约束移动；也可使用参数滑杆'
                  : '固定点或多自由度点，请使用滑杆'
              }
              aria-label={`选择点 ${point.label}`}
              aria-pressed={selectedPoints.includes(point.id)}
              onPointerDown={(event) => {
                event.stopPropagation();
                suppressClick.current = false;
                if (
                  event.button !== 0 ||
                  !props.draggablePoints?.includes(point.id) ||
                  !projectRef.current
                )
                  return;
                const path = props.getDragPath?.(point.id);
                if (!path?.samples.length) return;
                const origin = projectRef.current(p[point.id]);
                const samples = path.samples.map((s) => ({
                  ...projectRef.current!(s.position),
                  value: s.value,
                }));
                const current = nearestDragSample(
                  samples,
                  origin.x,
                  origin.y,
                  samples[0].value,
                ).value;
                drag.current = {
                  id: point.id,
                  pointer: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: origin.x,
                  originY: origin.y,
                  parameter: path.parameter,
                  current,
                  samples,
                  moved: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(true);
              }}
              onPointerMove={(event) => {
                const active = drag.current;
                if (!active || active.id !== point.id || active.pointer !== event.pointerId) return;
                event.stopPropagation();
                const dx = event.clientX - active.startX,
                  dy = event.clientY - active.startY;
                if (!active.moved && Math.hypot(dx, dy) < 3) return;
                active.moved = true;
                suppressClick.current = true;
                const next = nearestDragSample(
                  active.samples,
                  active.originX + dx,
                  active.originY + dy,
                  active.current,
                );
                active.current = next.value;
                props.onPointDrag?.(active.parameter, next.value);
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                if (drag.current?.pointer === event.pointerId) {
                  drag.current = null;
                  setDragging(false);
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDragging(false);
              }}
              onLostPointerCapture={() => {
                drag.current = null;
                setDragging(false);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (!suppressClick.current) onPoint(point.id);
                suppressClick.current = false;
              }}
            >
              {point.label}
              {props.draggablePoints?.includes(point.id) && <span aria-hidden="true"> ↔</span>}
            </button>
          ))}
        {showGhost && scene.id === 'square-fold' && (
          <span
            ref={(element) => {
              elements.current.ghost = element;
            }}
            className="geo-ghost-label"
          >
            A₀
          </span>
        )}
        {h && (
          <span
            ref={(element) => {
              elements.current.foot = element;
            }}
            className="geo-ghost-label"
          >
            H
          </span>
        )}
      </div>
    </div>
  );
}
