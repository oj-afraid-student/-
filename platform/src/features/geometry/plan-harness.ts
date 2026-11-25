import { sub, dot, unit } from './geometry';
import type { StudyProblem } from '@/shared/study-contract';
import { expandSkills } from './skill-library';
import { universalSchema, evaluateUniversal, type UniversalPlan } from './universal';

/** Only explicit, positive decimal equalities in confirmed conditions are supported.
 * No inference from drawings, questions, inequalities, variables or expressions. */
export function extractRequiredChecks(problem: StudyProblem) {
  const checks: UniversalPlan['checks'] = [];
  const point = "[A-Z](?:['′])?";
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])(${point})(${point})[=＝](\\d+(?:\\.\\d+)?)(?:(${point})(${point}))?(?=$|[，,。；;、\\s）)])`,
    'g',
  );
  for (const condition of problem.conditions) {
    for (const m of condition.replace(/\s*([=＝])\s*/g, '$1').matchAll(pattern)) {
      const value = Number(m[3]);
      if (!(value > 0 && value <= 10000)) continue;
      const label = (s: string) => s.replace(/′/g, "'");
      checks.push(
        m[4]
          ? {
              type: 'length_multiple',
              first: [label(m[1]), label(m[2])],
              second: [label(m[4]), label(m[5])],
              value,
            }
          : { type: 'distance', points: [label(m[1]), label(m[2])], value },
      );
    }
  }
  return [...new Map(checks.map((c) => [JSON.stringify(c), c])).values()];
}

export function enforceRequiredChecks(
  raw: unknown,
  required: UniversalPlan['checks'],
  problem?: StudyProblem,
): UniversalPlan {
  // Fill presentation-only defaults; never alter geometry or discard unknown fields.
  const input =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (structuredClone(raw) as Record<string, unknown>)
      : raw;
  if (input && typeof input === 'object' && 'faces' in input && Array.isArray(input.faces)) {
    input.faces = input.faces.map((f) =>
      f && typeof f === 'object' && !Array.isArray(f) && f.color === undefined
        ? { ...f, color: '#72a69a' }
        : f,
    );
  }
  if (
    problem &&
    input &&
    typeof input === 'object' &&
    'coverage' in input &&
    Array.isArray(input.coverage)
  ) {
    input.coverage = input.coverage.map((row) => {
      if (!row || typeof row !== 'object' || typeof row.quote !== 'string') return row;
      const matches = problem.conditions.flatMap((quote, index) =>
        quote === row.quote ? [index] : [],
      );
      return matches.length === 1 ? { ...row, index: matches[0] } : row;
    });
  }
  const plan = universalSchema.parse(input);
  const expanded = expandSkills(plan);
  const labels = new Map<string, string[]>();
  for (const n of expanded.nodes) {
    const label = n.label.replace(/[′’]/g, "'");
    labels.set(label, [...(labels.get(label) ?? []), n.id]);
  }
  const resolve = (label: string) => {
    const matches = labels.get(label);
    if (!matches || matches.length !== 1) throw new Error('题设约束无法唯一对应点名：' + label);
    return matches[0];
  };
  const pair = (p: [string, string]): [string, string] => [resolve(p[0]), resolve(p[1])];
  const checks = required.map((c) =>
    c.type === 'distance'
      ? { ...c, points: pair(c.points) }
      : { ...c, first: pair(c.first), second: pair(c.second) },
  );
  return {
    ...plan,
    checks: [...new Map([...plan.checks, ...checks].map((c) => [JSON.stringify(c), c])).values()],
  };
}

/** Verify explicit motion endpoints independently of the model's checks. */
export function verifyMotionEndpoints(plan: UniversalPlan, problem: StudyProblem) {
  const expanded = expandSkills(plan);
  for (const condition of problem.conditions) {
    const m = condition.replace(/\s/g, '').match(/^([A-Z])从([A-Z])(?:运动|移动)?到([A-Z])$/);
    if (!m) continue;
    const resolve = (label: string) => {
      const nodes = expanded.nodes.filter((n) => n.label === label);
      if (nodes.length !== 1) throw new Error('运动端点无法唯一对应：' + label);
      return nodes[0].id;
    };
    const moving = resolve(m[1]),
      start = resolve(m[2]),
      end = resolve(m[3]);
    const node = expanded.nodes.find((n) => n.id === moving)!;
    if (node.type !== 'rotate' || typeof node.angle === 'number')
      throw new Error('运动点必须关联可调旋转参数：' + m[1]);
    if (node.angle.scale === 0) throw new Error('运动角度不能固定为零变化');
    const parameterId = node.angle.parameter;
    const parameter = plan.parameters.find((p) => p.id === parameterId);
    if (!parameter) throw new Error('运动参数不存在');
    const initial = evaluateUniversal(plan, { [parameter.id]: parameter.min }).positions;
    const axis = unit(sub(initial[node.axis[1]], initial[node.axis[0]]));
    const radial = (id: string) => {
      const v = sub(initial[id], initial[node.axis[0]]);
      return v.map((x, i) => x - axis[i] * dot(v, axis)) as [number, number, number];
    };
    const v = radial(moving),
      w = radial(end);
    const cross: [number, number, number] = [
      v[1] * w[2] - v[2] * w[1],
      v[2] * w[0] - v[0] * w[2],
      v[0] * w[1] - v[1] * w[0],
    ];
    let delta = Math.atan2(dot(axis, cross), dot(v, w));
    if (delta * node.angle.scale < 0) delta += Math.sign(node.angle.scale) * 2 * Math.PI;
    const suggested = parameter.min + delta / node.angle.scale;
    for (const [value, target] of [
      [parameter.min, start],
      [parameter.max, end],
    ] as const) {
      const p = evaluateUniversal(plan, { [parameter.id]: value }).positions;
      const residual = Math.hypot(...p[moving].map((x, i) => x - p[target][i]));
      if (residual > 1e-6)
        throw new Error(
          `运动端点不满足题设：${m[1]}在${parameter.id}=${value}时应与${target}重合；距离=${residual}。根据当前轴和径向向量计算的候选上界为${suggested}；需核对轴向高度与旋转半径一致，并重新通过全部检查。不要猜角度或缩小运动范围。`,
        );
    }
  }
}
