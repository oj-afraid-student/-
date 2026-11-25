import { expandSkills } from './skill-library';
import { evaluateUniversal, type UniversalPlan } from './universal';
import { sub, unit } from './geometry';
import type { Vec3 } from './scene';
export type DragSample = { position: Vec3; value: number };
export type PointDragPath = { parameter: string; samples: DragSample[] };
/** Direct edge/fold controls; derived points with one degree of freedom inherit it. */
export function pointDragBindings(plan: UniversalPlan): Record<string, string> {
  const nodes = expandSkills(plan).nodes;
  const dependencies = new Map<string, Set<string>>();
  const bindings: Record<string, string> = {};
  for (const n of nodes) {
    const deps =
      n.type === 'fixed'
        ? []
        : n.type === 'translate'
          ? [n.source]
          : n.type === 'lerp'
            ? n.ends
            : n.type === 'ratio_point'
              ? [...n.ends, ...n.reference]
              : n.type === 'rotate'
                ? [n.source, ...n.axis]
                : [n.source, ...n.plane];
    const params = new Set(deps.flatMap((id) => [...(dependencies.get(id) ?? [])]));
    const control = n.type === 'lerp' ? n.t : n.type === 'rotate' ? n.angle : undefined;
    if (control && typeof control === 'object' && control.scale !== 0) {
      params.add(control.parameter);
      bindings[n.id] = control.parameter;
    } else if (params.size === 1) bindings[n.id] = [...params][0];
    dependencies.set(n.id, params);
  }
  return bindings;
}
export function buildPointDragPath(
  plan: UniversalPlan,
  values: Record<string, number>,
  point: string,
  parameter: string,
): PointDragPath {
  const control = plan.parameters.find((p) => p.id === parameter);
  if (!control) throw new Error('未知拖动参数');
  const samples: DragSample[] = [];
  for (let i = 0; i <= 200; i++) {
    const value = control.min + ((control.max - control.min) * i) / 200;
    try {
      const position = evaluateUniversal(plan, { ...values, [parameter]: value }).positions[point];
      if (position) samples.push({ position, value });
    } catch {
      /* Never drag through an invalid configuration. */
    }
  }
  return { parameter, samples };
}
/** Fixed display transform for the whole plan: dragging must not recenter the camera. */
export function planDisplayTransform(plan: UniversalPlan) {
  const points: Vec3[] = [];
  const sample = (i: number, values: Record<string, number>) => {
    if (i === plan.parameters.length) {
      try {
        const evaluation = evaluateUniversal(plan, values);
        points.push(...Object.values(evaluation.positions));
        for (const s of plan.solids ?? [])
          for (const center of s.type === 'cylinder' ? s.ends : [s.center]) {
            const c = evaluation.positions[center];
            const axis =
              s.type === 'cylinder'
                ? unit(sub(evaluation.positions[s.ends[1]], evaluation.positions[s.ends[0]]))
                : null;
            const extent = [0, 1, 2].map(
              (i) => s.radius * (axis ? Math.sqrt(Math.max(0, 1 - axis[i] ** 2)) : 1),
            );
            points.push(
              c.map((v, i) => v - (s.type === 'hemisphere' && i === 2 ? 0 : extent[i])) as Vec3,
              c.map((v, i) => v + extent[i]) as Vec3,
            );
          }
      } catch {}
      return;
    }
    const p = plan.parameters[i];
    for (let j = 0; j <= 4; j++)
      sample(i + 1, { ...values, [p.id]: p.min + ((p.max - p.min) * j) / 4 });
  };
  sample(0, {});
  if (!points.length) throw new Error('无可显示构型');
  const lo = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
    hi = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])));
  const scale = 4 / Math.max(1e-6, ...hi.map((x, i) => x - lo[i]));
  return (p: Vec3) => p.map((x, i) => (x - (lo[i] + hi[i]) / 2) * scale + [2, 2, 0.6][i]) as Vec3;
}
export function nearestDragSample(
  samples: { x: number; y: number; value: number }[],
  x: number,
  y: number,
  current: number,
) {
  return samples.reduce((best, s) => {
    const score = (p: typeof s) => (p.x - x) ** 2 + (p.y - y) ** 2;
    const a = score(s),
      b = score(best);
    return a < b - 0.01 ||
      (Math.abs(a - b) <= 0.01 && Math.abs(s.value - current) < Math.abs(best.value - current))
      ? s
      : best;
  });
}
