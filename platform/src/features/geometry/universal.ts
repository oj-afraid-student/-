import { z } from 'zod';
import { skillSchema, expandSkills } from './skill-library';
import { sceneSchema, metricSchema, type GeometryScene, type Positions } from './scene';
import { parseScene } from './constraints';
import { add, scale, sub, foldRigidPanel, projectToPlane, distance, dot, unit } from './geometry';
import { evaluateMetrics } from './metrics';
import type { StudyProblem } from '@/shared/study-contract';
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,24}$/),
  pair = z.tuple([id, id]);
const scalar = z.union([
  z.number().finite().min(-10000).max(10000),
  z
    .object({
      parameter: id,
      scale: z.number().finite().min(-1000).max(1000),
      offset: z.number().finite().min(-10000).max(10000),
    })
    .strict(),
]);
const node = z.discriminatedUnion('type', [
  z
    .object({
      id,
      label: z.string().max(20),
      type: z.literal('ratio_point'),
      ends: pair,
      reference: pair,
      ratio: z.number().finite().positive().max(10000),
    })
    .strict(),
  z
    .object({
      id,
      label: z.string().max(20),
      type: z.literal('translate'),
      source: id,
      vector: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    })
    .strict(),
  z
    .object({
      id,
      label: z.string().max(20),
      type: z.literal('fixed'),
      position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    })
    .strict(),
  z
    .object({ id, label: z.string().max(20), type: z.literal('lerp'), ends: pair, t: scalar })
    .strict(),
  z
    .object({
      id,
      label: z.string().max(20),
      type: z.literal('rotate'),
      source: id,
      axis: pair,
      angle: scalar,
    })
    .strict(),
  z
    .object({
      id,
      label: z.string().max(20),
      type: z.literal('foot'),
      source: id,
      plane: z.tuple([id, id, id]),
    })
    .strict(),
]);
const check = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('length_multiple'),
      first: pair,
      second: pair,
      value: z.number().positive(),
    })
    .strict(),
  z
    .object({ type: z.literal('distance'), points: pair, value: z.number().positive().max(10000) })
    .strict(),
  z
    .object({
      type: z.literal('ratio'),
      first: pair,
      second: pair,
      value: z.number().positive().max(10000),
    })
    .strict(),
  z.object({ type: z.literal('perpendicular'), first: pair, second: pair }).strict(),
  z.object({ type: z.literal('parallel'), first: pair, second: pair }).strict(),
]);
export const universalSchema = z
  .object({
    boundaryCollapse: z.boolean().optional(),
    trace: z.object({ point: id, parameter: id }).strict().optional(),
    title: z.string().min(1).max(120),
    reason: z.string().max(1500),
    limitations: z.array(z.string().max(500)).max(15),
    parameters: z
      .array(
        z
          .object({
            id,
            label: z.string().max(80),
            min: z.number().finite(),
            max: z.number().finite(),
            initial: z.number().finite(),
            unit: z.enum(['rad', 'ratio', 'length']),
          })
          .strict(),
      )
      .max(3),
    nodes: z.array(node).max(32),
    skills: z.array(skillSchema).max(20).optional(),
    segments: sceneSchema.shape.segments,
    faces: sceneSchema.shape.faces,
    metrics: z
      .array(
        z.union([
          metricSchema,
          z
            .object({
              id,
              label: z.string().max(80),
              type: z.literal('point_line'),
              point: id,
              line: pair,
            })
            .strict(),
        ]),
      )
      .max(12),
    checks: z.array(check).max(30),
    coverage: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            quote: z.string().max(1000),
            explanation: z.string().max(1000),
            status: z.enum(['represented', 'unresolved']),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
export type UniversalPlan = z.infer<typeof universalSchema>;
export function evaluateUniversal(input: UniversalPlan, values: Record<string, number>) {
  const plan = expandSkills(input);
  if (plan.nodes.length < 3) throw new Error('至少需要三个点');
  const globalIds = [
    ...plan.nodes,
    ...plan.segments,
    ...plan.faces,
    ...plan.metrics,
    ...plan.parameters,
  ].map((x) => x.id);
  if (new Set(globalIds).size !== globalIds.length) throw new Error('场景对象标识重复');
  const ids = new Set<string>();
  const params: Record<string, number> = {};
  for (const p of plan.parameters) {
    if (
      ids.has(p.id) ||
      p.min >= p.max ||
      Math.max(Math.abs(p.min), Math.abs(p.max)) > 10000 ||
      p.initial < p.min ||
      p.initial > p.max
    )
      throw new Error('参数定义错误');
    ids.add(p.id);
    const value = values[p.id] ?? p.initial;
    if (!Number.isFinite(value) || value < p.min || value > p.max) throw new Error('参数超出范围');
    params[p.id] = value;
  }
  if (Object.keys(values).some((k) => !(k in params))) throw new Error('未知参数');
  const scalarValue = (s: z.infer<typeof scalar>) => {
    if (typeof s === 'number') return s;
    if (!(s.parameter in params)) throw new Error('引用未知参数');
    return params[s.parameter] * s.scale + s.offset;
  };
  const p: Positions = {};
  const get = (id: string) => {
    if (!p[id]) throw new Error('点依赖不存在或顺序错误：' + id);
    return p[id];
  };
  for (const n of plan.nodes) {
    if (ids.has(n.id)) throw new Error('重复标识');
    ids.add(n.id);
    if (n.type === 'fixed') p[n.id] = n.position;
    else if (n.type === 'translate') p[n.id] = add(get(n.source), n.vector);
    else if (n.type === 'ratio_point') {
      const a = get(n.ends[0]),
        b = get(n.ends[1]),
        edgeLength = distance(a, b);
      if (edgeLength < 1e-9) throw new Error('比例动点所在边退化');
      const t = (distance(get(n.reference[0]), get(n.reference[1])) * n.ratio) / edgeLength;
      if (t < 0 || t > 1) throw new Error('比例条件要求点超出指定边');
      p[n.id] = add(a, scale(sub(b, a), t));
    } else if (n.type === 'lerp') {
      const t = scalarValue(n.t);
      if (t < 0 || t > 1) throw new Error('边上动点越界');
      p[n.id] = add(get(n.ends[0]), scale(sub(get(n.ends[1]), get(n.ends[0])), t));
    } else if (n.type === 'foot')
      p[n.id] = projectToPlane(get(n.source), get(n.plane[0]), get(n.plane[1]), get(n.plane[2]));
    else {
      get(n.source);
      n.axis.forEach(get);
      p[n.id] = foldRigidPanel(p, n.axis, [n.source], scalarValue(n.angle))[n.source];
    }
    if (p[n.id].some((v) => !Number.isFinite(v) || Math.abs(v) > 10000))
      throw new Error('坐标范围无效');
  }
  for (const s of plan.skills ?? []) {
    if (s.skill === 'pyramid' || s.skill === 'prism') {
      const apex = get(s.skill === 'pyramid' ? s.apex : s.top[0]);
      if (
        distance(apex, projectToPlane(apex, get(s.base[0]), get(s.base[1]), get(s.base[2]))) < 1e-8
      )
        throw new Error('棱柱或棱锥高度退化');
    }
  }
  let residual = 0;
  const length = (pair: [string, string]) => distance(get(pair[0]), get(pair[1]));
  const direction = (pair: [string, string]) => unit(sub(get(pair[1]), get(pair[0])));
  for (const c of plan.checks) {
    let r = 0;
    if (c.type === 'distance') r = Math.abs(length(c.points) - c.value) / Math.max(1, c.value);
    else if (c.type === 'length_multiple')
      r =
        Math.abs(length(c.first) - c.value * length(c.second)) /
        Math.max(1, length(c.first), c.value * length(c.second));
    else if (c.type === 'ratio') {
      const d = length(c.second);
      if (d < 1e-9) throw new Error('比例分母退化');
      r = Math.abs(length(c.first) / d - c.value) / Math.max(1, c.value);
    } else {
      const v = Math.abs(dot(direction(c.first), direction(c.second)));
      r = c.type === 'parallel' ? Math.abs(1 - v) : v;
    }
    if (r > 1e-7)
      throw new Error(
        '约束不满足：' + JSON.stringify(c) + '；参数=' + JSON.stringify(params) + '；残差=' + r,
      );
    residual = Math.max(residual, r);
  }
  if (residual > 1e-7) throw new Error('几何约束不满足，已拒绝该构型');
  const boundary =
    plan.boundaryCollapse &&
    plan.parameters.some(
      (parameter) =>
        Math.abs(params[parameter.id] - parameter.min) < 1e-10 ||
        Math.abs(params[parameter.id] - parameter.max) < 1e-10,
    );
  const segments = boundary
    ? plan.segments.filter((s) => distance(get(s.points[0]), get(s.points[1])) > 1e-9)
    : plan.segments;
  const faces = boundary
    ? plan.faces
        .map((f) => ({
          ...f,
          vertices: f.vertices.filter(
            (id, i, all) => all.findIndex((other) => distance(get(id), get(other)) < 1e-9) === i,
          ),
        }))
        .filter((f) => f.vertices.length >= 3)
    : plan.faces;
  const scene: GeometryScene = parseScene({
    version: '1.0',
    id: 'custom',
    title: plan.title,
    facts: [],
    assumptions: plan.limitations,
    points: plan.nodes.map((n) => ({ id: n.id, label: n.label, initial: p[n.id] })),
    segments,
    faces,
    constraints: [],
    metrics: plan.metrics.filter((m) => m.type !== 'point_line'),
  });
  const metrics = evaluateMetrics(scene.metrics, p);
  for (const m of plan.metrics)
    if (m.type === 'point_line') {
      const a = get(m.line[0]),
        u = direction(m.line),
        v = sub(get(m.point), a);
      metrics[m.id] = { value: distance(v, scale(u, dot(v, u))), unit: '长度单位' };
    }
  return { scene, positions: p, metrics, residual };
}
export function validateUniversal(raw: unknown, problem: StudyProblem) {
  const plan = universalSchema.parse(raw);
  const warnings = [...plan.limitations, ...problem.uncertainties];
  if (!plan.checks.length) warnings.push('此方案没有独立数值约束，仅可作为示意图');
  for (let i = 0; i < problem.conditions.length; i++) {
    const rows = plan.coverage.filter((c) => c.index === i);
    if (
      rows.length !== 1 ||
      rows[0].quote !== problem.conditions[i] ||
      rows[0].status !== 'represented'
    )
      warnings.push('条件 ' + (i + 1) + ' 尚未可靠对应');
  }
  if (plan.coverage.some((c) => c.index >= problem.conditions.length))
    throw new Error('无效条件索引');
  const defaults = Object.fromEntries(plan.parameters.map((p) => [p.id, p.initial]));
  const initial = evaluateUniversal(plan, defaults);
  if (
    plan.trace &&
    (!plan.parameters.some((p) => p.id === plan.trace!.parameter) ||
      !initial.positions[plan.trace.point])
  )
    throw new Error('轨迹引用的动点或参数不存在');
  let samples = 0;
  function sample(index: number, values: Record<string, number>) {
    if (index === plan.parameters.length) {
      evaluateUniversal(plan, values);
      samples++;
      return;
    }
    const p = plan.parameters[index];
    for (let i = 0; i <= 4; i++)
      sample(index + 1, { ...values, [p.id]: p.min + ((p.max - p.min) * i) / 4 });
  }
  sample(0, {});
  return {
    plan,
    samples,
    warnings: [...new Set(warnings)],
    verification: '采样与声明约束已检查；题意匹配和连续区间正确性未经证明',
  };
}
