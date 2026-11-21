'use client';

import {
  useEffect,
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
import { projectToPlane } from './geometry';

function Face({ vertices, color, opacity }: { vertices: Vec3[]; color: string; opacity: number }) {
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
    <mesh geometry={geometry} renderOrder={0}>
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
}: {
  points: Vec3[];
  color: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <>
      <Line
        points={points}
        color={color}
        lineWidth={selected ? 4 : 2}
        renderOrder={2}
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          onSelect?.();
        }}
      />
      <Line
        points={points}
        color={color}
        lineWidth={1.5}
        dashed
        dashSize={0.12}
        gapSize={0.09}
        depthFunc={GreaterDepth}
        depthWrite={false}
        renderOrder={3}
      />
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
function CameraRig({ view, version }: { view: 'iso' | 'top' | 'front'; version: number }) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  // Synchronize the external Three.js camera before paint; this is not React state.
  /* eslint-disable react-hooks/immutability */
  useLayoutEffect(() => {
    const position: Vec3 =
      view === 'top' ? [2, 2, 14] : view === 'front' ? [2, -12, 0.01] : [9, -10, 9];
    camera.position.set(...position);
    camera.up.set(0, 0, 1);
    if (camera instanceof OrthographicCamera) {
      camera.zoom = Math.min(65, Math.max(25, (size.width - 70) / 5.7), (size.height - 70) / 5.7);
      camera.updateProjectionMatrix();
    }
    controls.current?.target.set(2, 2, 0.6);
    controls.current?.update();
    invalidate();
  }, [camera, size.width, size.height, invalidate, view, version]);
  /* eslint-enable react-hooks/immutability */
  return (
    <OrbitControls ref={controls} makeDefault target={[2, 2, 0.6]} minZoom={25} maxZoom={180} />
  );
}
type Props = {
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
  view: 'iso' | 'top' | 'front';
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
  const elements = useRef<Record<string, HTMLElement | null>>({});
  const initial = initialPositions(scene);
  const h = scene.id === 'square-fold' ? projectToPlane(p.A, p.B, p.C, p.D) : null;
  return (
    <div className="geo-renderer">
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
        <color attach="background" args={['#f5f7f3']} />
        <CameraRig view={view} version={cameraVersion} />
        {props.traces?.map((points, i) => (
          <Line key={'trace' + i} points={points} color="#b7518d" lineWidth={2} />
        ))}
        {scene.faces
          .filter((f) => showBase || f.id !== 'base')
          .map((f) => (
            <Face
              key={f.id}
              vertices={f.vertices.map((id) => p[id])}
              color={f.color}
              opacity={opacity}
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
            points={s.points.map((id) => p[id])}
            color={s.id === 'DE' ? '#b47720' : '#47796e'}
            selected={selectedLine === s.id}
            onSelect={() => onLine(s.id)}
          />
        ))}
        {constructions.map((s) => (
          <Edge
            key={s.id}
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
              <sphereGeometry args={[0.075, 16, 12]} />
              <meshBasicMaterial
                color={selectedPoints.includes(point.id) ? '#b7518d' : '#285d52'}
                depthTest={false}
              />
            </mesh>
          </group>
        ))}
        <ProjectLabels
          positions={{ ...p, ...(h ? { ghost: initial.A, foot: h } : {}) }}
          elements={elements}
        />
      </Canvas>
      <div className="geo-label-layer">
        {scene.points.map((point) => (
          <button
            key={point.id}
            ref={(element) => {
              elements.current[point.id] = element;
            }}
            className={`geo-point ${selectedPoints.includes(point.id) ? 'selected' : ''}`}
            aria-label={`选择点 ${point.label}`}
            aria-pressed={selectedPoints.includes(point.id)}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onPoint(point.id);
            }}
          >
            {point.label}
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
