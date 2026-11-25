import { evaluateUniversal, type UniversalPlan } from './universal';
import { distance, dot, sub, unit, projectToPlane } from './geometry';
import type { Positions } from './scene';
export type Observation = {
  id: string;
  kind: 'distance' | 'point_line' | 'height' | 'line_angle';
  points: string[];
};
export function measureObservation(item: Observation, p: Positions): string {
  try {
    const q = item.points.map((id) => {
      if (!p[id]) throw new Error();
      return p[id];
    });
    let value: number;
    if (item.kind === 'distance') value = distance(q[0], q[1]);
    else if (item.kind === 'height') value = distance(q[0], projectToPlane(q[0], q[1], q[2], q[3]));
    else if (item.kind === 'point_line') {
      const u = unit(sub(q[2], q[1])),
        v = sub(q[0], q[1]);
      value = Math.hypot(...v.map((x, i) => x - u[i] * dot(v, u)));
    } else
      value =
        (Math.acos(Math.min(1, Math.abs(dot(unit(sub(q[1], q[0])), unit(sub(q[3], q[2])))))) *
          180) /
        Math.PI;
    if (!Number.isFinite(value)) throw new Error();
    return value.toFixed(4) + (item.kind === 'line_angle' ? '°' : '');
  } catch {
    return '当前构型退化，无法测量';
  }
}
export function addMidpoint(plan: UniversalPlan, ends: [string, string]) {
  if (ends[0] === ends[1]) throw new Error('请选择两个不同的点');
  const p = evaluateUniversal(plan, {}).positions;
  let i = 1;
  while (p['UserM' + i]) i++;
  const id = 'UserM' + i;
  return {
    ...plan,
    nodes: [...plan.nodes, { id, label: 'M' + i, type: 'lerp' as const, ends, t: 0.5 }],
  };
}
export function addFaceFold(
  plan: UniversalPlan,
  faceId: string,
  axis: [string, string],
): UniversalPlan {
  const face = evaluateUniversal(plan, {}).scene.faces.find((f) => f.id === faceId);
  if (!face || axis[0] === axis[1] || !axis.every((id) => face.vertices.includes(id)))
    throw new Error('请先选面，再选择该面上的两个不同顶点作为折痕');
  if (plan.parameters.length >= 3) throw new Error('当前模型已有3个自由参数，请使用现有折叠参数');
  const points = evaluateUniversal(plan, {}).scene.points;
  let i = 1;
  while (plan.parameters.some((p) => p.id === 'userFold' + i)) i++;
  const parameter = 'userFold' + i;
  const moving = face.vertices.filter((id) => !axis.includes(id));
  const outputs = moving.map((id) => ({
    source: id,
    id: 'Fold' + i + '_' + id,
    label: (points.find((p) => p.id === id)?.label ?? id) + '′',
  }));
  const mapped = face.vertices.map((id) => outputs.find((p) => p.source === id)?.id ?? id);
  return {
    ...plan,
    boundaryCollapse: true,
    parameters: [
      ...plan.parameters,
      { id: parameter, label: '自定义折叠角', min: 0, max: Math.PI, initial: 0, unit: 'rad' },
    ],
    skills: [
      ...(plan.skills ?? []),
      {
        skill: 'rotate_group',
        id: 'foldStep' + i,
        axis,
        angle: { parameter, scale: 1, offset: 0 },
        outputs,
      },
    ],
    faces: [
      ...plan.faces.filter((f) => f.id !== faceId),
      { id: 'foldPanel' + i, vertices: mapped, color: '#8bc7c5' },
    ],
    segments: [
      ...plan.segments,
      ...mapped.map((id, j) => ({
        id: 'foldEdge' + i + '_' + j,
        points: [id, mapped[(j + 1) % mapped.length]] as [string, string],
      })),
    ],
  };
}
