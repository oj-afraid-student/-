import { sceneSchema, type GeometryScene, type Positions } from './scene';
import {
  add,
  cross,
  distance,
  dot,
  EPS,
  foldRigidPanel,
  norm,
  planeNormal,
  scale,
  sub,
} from './geometry';
import { evaluateMetrics } from './metrics';

export function initialPositions(scene: GeometryScene): Positions {
  return Object.fromEntries(scene.points.map((p) => [p.id, p.initial]));
}
export function parseScene(input: unknown): GeometryScene {
  const scene = sceneSchema.parse(input);
  const all = [
    ...scene.points,
    ...scene.segments,
    ...scene.faces,
    ...(scene.solids ?? []),
    ...scene.metrics,
  ].map((e) => e.id);
  if (new Set(all).size !== all.length) throw new Error('场景对象 ID 重复。');
  const points = new Set(scene.points.map((p) => p.id));
  const refs = (ids: string[]) => {
    if (ids.some((id) => !points.has(id))) throw new Error('场景引用了不存在的点。');
    if (new Set(ids).size !== ids.length) throw new Error('几何对象含重复点。');
  };
  for (const s of scene.solids ?? []) {
    if ('ends' in s) refs(s.ends);
    else refs([s.center]);
  }
  for (const s of scene.segments) refs(s.points);
  for (const f of scene.faces) refs(f.vertices);
  for (const c of scene.constraints) {
    if (c.type === 'fixed') refs(c.points);
    else if (c.type === 'initial_midpoint') refs([c.point, ...c.of]);
    else if (!scene.faces.some((f) => f.id === c.face))
      throw new Error('刚体约束引用了不存在的面。');
  }
  for (const m of scene.metrics) {
    if (m.type === 'distance') refs(m.points);
    else if (m.type === 'height') {
      refs([m.point]);
      refs(m.plane);
    } else m.lines.forEach(refs);
  }
  if (scene.motion) {
    const m = scene.motion;
    refs([...m.axis, ...m.moving]);
    if (m.initial > m.max) throw new Error('初始参数超出范围。');
  }
  const p = initialPositions(scene);
  if (Object.values(p).some((v) => v.some((x) => Math.abs(x) > 1e6)))
    throw new Error('坐标超过第一阶段计算范围。');
  for (const s of scene.segments)
    if (distance(p[s.points[0]], p[s.points[1]]) < EPS) throw new Error('退化线段。');
  for (const s of scene.solids ?? [])
    if ('ends' in s && distance(p[s.ends[0]], p[s.ends[1]]) < EPS)
      throw new Error('旋转体轴线退化');
  validateConstraints(scene, p);
  return scene;
}

/** Normalized residuals; all pairs in each rigid face are checked, not only its edges. */
export function validateConstraints(scene: GeometryScene, p: Positions): number {
  const initial = initialPositions(scene);
  let residual = 0;
  const check = (r: number) => {
    residual = Math.max(residual, r);
  };
  if (Object.values(p).some((v) => v.some((x) => !Number.isFinite(x))))
    throw new Error('构型包含非有限坐标。');
  for (const f of scene.faces) {
    const vertices = f.vertices.map((id) => p[id]);
    const n = planeNormal(vertices[0], vertices[1], vertices[2]);
    const size = Math.max(1, ...vertices.map((v) => norm(sub(v, vertices[0]))));
    for (const v of vertices) check(Math.abs(dot(sub(v, vertices[0]), n)) / size);
    for (let i = 0; i < vertices.length; i++) {
      const turn = cross(
        sub(vertices[(i + 1) % vertices.length], vertices[i]),
        sub(vertices[(i + 2) % vertices.length], vertices[(i + 1) % vertices.length]),
      );
      if (dot(turn, n) <= EPS) throw new Error('不支持退化、自交或非凸面片。');
    }
  }
  for (const c of scene.constraints) {
    if (c.type === 'fixed')
      for (const id of c.points)
        check(distance(p[id], initial[id]) / Math.max(1, norm(initial[id])));
    else if (c.type === 'initial_midpoint')
      check(distance(initial[c.point], scale(add(initial[c.of[0]], initial[c.of[1]]), 0.5)));
    else {
      const f = scene.faces.find((f) => f.id === c.face)!;
      for (let i = 0; i < f.vertices.length; i++)
        for (let j = i + 1; j < f.vertices.length; j++) {
          const [a, b] = [f.vertices[i], f.vertices[j]];
          const expected = distance(initial[a], initial[b]);
          check(Math.abs(distance(p[a], p[b]) - expected) / Math.max(1, expected));
        }
    }
  }
  if (residual > EPS)
    throw new Error(`硬约束校验失败（归一化残差 ${residual.toExponential(2)}），已拒绝更新。`);
  return residual;
}
export function evaluateScene(scene: GeometryScene, theta: number) {
  const m = scene.motion;
  if (!Number.isFinite(theta) || theta < 0 || theta > (m?.max ?? 0))
    throw new Error('折叠角超出合法范围。');
  const initial = initialPositions(scene);
  const positions = m ? foldRigidPanel(initial, m.axis, m.moving, theta * m.sign) : initial;
  const residual = validateConstraints(scene, positions);
  return { positions, residual, metrics: evaluateMetrics(scene.metrics, positions) };
}
