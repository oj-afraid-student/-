import type { CandidateDiagram } from './candidate-diagram';

type Vec = [number, number, number];
type Midpoint = { point: string; a: string; b: string };
export type DiagramView = { yaw: number; pitch: number; zoom: number };
export const DEFAULT_DIAGRAM_VIEW: DiagramView = { yaw: -15, pitch: 25, zoom: 0.85 };
const sub = (a: Vec, b: Vec): Vec => a.map((v, i) => v - b[i]) as Vec;
const dot = (a: Vec, b: Vec) => a.reduce((s, v, i) => s + v * b[i], 0);
const length = (a: Vec) => Math.sqrt(dot(a, a));
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
function normalized(text: string) {
  return text
    .replace(/\\sqrt\{([\d.]+)\}/g, '√$1')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
    .replace(
      /\\(?:parallel|angle|triangle)/g,
      (v) => ({ '\\parallel': '∥', '\\angle': '∠', '\\triangle': '△' })[v]!,
    )
    .replace(/\s|\$|\\left|\\right/g, '')
    .replace(/\\perp/g, '⊥')
    .replace(/\/\/|\|\|/g, '∥')
    .replace(/＝/g, '=');
}
const numeric = '(?:√[0-9]+(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?)(?:/[0-9]+(?:\\.[0-9]+)?)?';
function numberValue(raw: string) {
  const [a, b] = raw.split('/');
  return (a.startsWith('√') ? Math.sqrt(Number(a.slice(1))) : Number(a)) / (b ? Number(b) : 1);
}
export function midpointRules(text: string): Midpoint[] {
  const t = normalized(text),
    rules: Midpoint[] = [];
  for (const match of t.matchAll(/([A-Z])(?:为|是)(?:线段|棱|边)?([A-Z])([A-Z])的?中点/g))
    rules.push({ point: match[1], a: match[2], b: match[3] });
  for (const match of t.matchAll(/(?:取|设)([A-Z])([A-Z])的?中点(?:为)?([A-Z])/g))
    rules.push({ point: match[3], a: match[1], b: match[2] });
  return rules.filter(
    (r, i) => rules.findIndex((p) => p.point === r.point && p.a === r.a && p.b === r.b) === i,
  );
}
export function keepMidpoints(diagram: CandidateDiagram, text: string): CandidateDiagram {
  const points = diagram.points.map((p) => ({ ...p })),
    rules = midpointRules(text);
  const active = new Set<string>(),
    done = new Set<string>();
  function solve(id: string) {
    if (done.has(id)) return;
    const rule = rules.find((r) => r.point === id);
    if (!rule) return;
    if (active.has(id)) throw new Error('中点约束循环，无法应用配图。');
    active.add(id);
    solve(rule.a);
    solve(rule.b);
    const p = points.find((p) => p.id === id),
      a = points.find((p) => p.id === rule.a),
      b = points.find((p) => p.id === rule.b);
    if (!p || !a || !b) throw new Error(`中点约束 ${id} 缺少端点，不能删除关联顶点。`);
    p.x = (a.x + b.x) / 2;
    p.y = (a.y + b.y) / 2;
    active.delete(id);
    done.add(id);
  }
  rules.forEach((r) => solve(r.point));
  if (
    rules.some((r) => {
      const p = points.find((p) => p.id === r.point)!,
        a = points.find((p) => p.id === r.a)!,
        b = points.find((p) => p.id === r.b)!;
      return !close(p.x, (a.x + b.x) / 2) || !close(p.y, (a.y + b.y) / 2);
    })
  )
    throw new Error('中点约束相互冲突，不能应用配图。');
  return { ...diagram, points };
}

export type SolidModel = {
  points: Record<string, Vec>;
  conditions: string[];
  lengths: { a: string; b: string; text: string }[];
  angle: string;
};
/** Verified family: equilateral PAB over an isosceles trapezoid ABCD. */
export function constrainedSolid(text: string): { model?: SolidModel; error?: string } {
  const t = normalized(text);
  if (!/PAB.{0,5}等边三角形/.test(t) || !/ABCD.{0,5}等腰梯形/.test(t) || !/(CD∥AB|AB∥CD)/.test(t))
    return {};
  const read = (id: string) => new RegExp(`(?<![A-Z])${id}=(${numeric})`).exec(t)?.[1];
  const bs = read('AB'),
    cs = read('CD'),
    ls = read('AD');
  const angle = /(?:∠|角)PAD=([0-9]+(?:\.[0-9]+)?)(?:°|度)/.exec(t)?.[1];
  if (!bs || !cs || !ls || !angle)
    return { error: '约束建模缺少AB、CD、AD长度或∠PAD角度，不能自由移动后应用。' };
  const b = numberValue(bs),
    c = numberValue(cs),
    l = numberValue(ls),
    theta = (Number(angle) * Math.PI) / 180;
  const d = (b - c) / 2,
    h2 = l * l - d * d;
  if (!(b > c && c > 0 && h2 > 1e-10 && Number(angle) > 0 && Number(angle) < 180))
    return { error: '梯形边长或角度条件不能构成当前非退化模型，请核对题干。' };
  const h = Math.sqrt(h2),
    py = (b * l * Math.cos(theta) - (b * d) / 2) / h,
    z2 = (3 * b * b) / 4 - py * py;
  if (!(z2 > 1e-10)) return { error: '现有长度与角度条件不能构成非退化四棱锥，请核对题干。' };
  const points: Record<string, Vec> = {
    A: [0, 0, 0],
    B: [b, 0, 0],
    C: [b - d, h, 0],
    D: [d, h, 0],
    P: [b / 2, py, Math.sqrt(z2)],
  };
  const rules = midpointRules(t);
  for (let i = 0; i < rules.length; i++)
    for (const r of rules) {
      if (!points[r.point] && points[r.a] && points[r.b])
        points[r.point] = points[r.a].map((v, j) => (v + points[r.b][j]) / 2) as Vec;
    }
  if (rules.some((r) => !points[r.point] || !points[r.a] || !points[r.b]))
    return { error: '部分中点约束不受当前模型支持，请保留原照片。' };
  if (
    rules.some(
      (r) => !points[r.point].every((v, i) => close(v, (points[r.a][i] + points[r.b][i]) / 2)),
    )
  )
    return { error: '中点条件相互冲突，不能应用配图。' };
  // Extra explicit metric equalities must also hold; never silently discard them.
  for (const m of t.matchAll(new RegExp(`(?<![A-Z])([A-Z])([A-Z])=(${numeric})`, 'g'))) {
    if (
      !points[m[1]] ||
      !points[m[2]] ||
      !close(length(sub(points[m[1]], points[m[2]])), numberValue(m[3]))
    )
      return { error: `附加条件 ${m[0]} 与当前三维模型不一致，不能应用。` };
  }
  for (const m of t.matchAll(/(?:∠|角)([A-Z])([A-Z])([A-Z])=([0-9]+(?:\.[0-9]+)?)(?:°|度)/g)) {
    const [a, o, b] = [points[m[1]], points[m[2]], points[m[3]]];
    if (!a || !o || !b) return { error: `角度条件${m[0]}不受当前模型支持。` };
    const u = sub(a, o),
      v = sub(b, o);
    if (!close(dot(u, v) / (length(u) * length(v)), Math.cos((Number(m[4]) * Math.PI) / 180)))
      return { error: `角度条件${m[0]}与当前模型冲突，不能应用。` };
  }
  for (const m of t.matchAll(/(平面[A-Z]{3,4}|[A-Z]{2})(∥|⊥)(平面[A-Z]{3,4}|[A-Z]{2})/g)) {
    function direction(name: string) {
      const plane = name.startsWith('平面'),
        ids = name.replace('平面', '').split('');
      if (ids.some((id) => !points[id])) return null;
      const vector = plane
        ? cross(sub(points[ids[1]], points[ids[0]]), sub(points[ids[2]], points[ids[0]]))
        : sub(points[ids[1]], points[ids[0]]);
      if (
        length(vector) < 1e-9 ||
        (plane &&
          ids.slice(3).some((id) => !close(dot(vector, sub(points[id], points[ids[0]])), 0)))
      )
        return null;
      return { plane, vector: vector.map((v) => v / length(vector)) as Vec };
    }
    const a = direction(m[1]),
      b = direction(m[3]);
    if (!a || !b) return { error: `关系${m[0]}的点或平面无法验证，不能应用。` };
    const useDot = (m[2] === '⊥') === (a.plane === b.plane);
    if (!close(useDot ? dot(a.vector, b.vector) : length(cross(a.vector, b.vector)), 0))
      return { error: `关系${m[0]}与三维模型不一致，不能应用。` };
  }
  const model: SolidModel = {
    points,
    conditions: [
      `PA=PB=AB=${bs}`,
      `CD∥AB，CD=${cs}`,
      `AD=BC=${ls}`,
      `∠PAD=${angle}°`,
      ...rules.map((r) => `${r.point}为${r.a}${r.b}的中点`),
    ],
    lengths: [
      { a: 'A', b: 'B', text: bs },
      { a: 'C', b: 'D', text: cs },
      { a: 'A', b: 'D', text: ls },
    ],
    angle: `∠PAD=${angle}°`,
  };
  return { model };
}
export function projectSolid(
  model: SolidModel,
  diagram: CandidateDiagram,
  view: DiagramView,
): CandidateDiagram {
  if (![view.yaw, view.pitch, view.zoom].every(Number.isFinite) || view.zoom < 0.5 || view.zoom > 1)
    throw new Error('视角参数无效。');
  const yaw = (view.yaw * Math.PI) / 180,
    pitch = (view.pitch * Math.PI) / 180;
  const raw = Object.entries(model.points).map(([id, [x, y, z]]) => ({
    id,
    x: x * Math.cos(yaw) - y * Math.sin(yaw),
    y: -(x * Math.sin(yaw) + y * Math.cos(yaw)) * Math.sin(pitch) - z * Math.cos(pitch),
  }));
  const xs = raw.map((p) => p.x),
    ys = raw.map((p) => p.y),
    left = Math.min(...xs),
    top = Math.min(...ys);
  const width = Math.max(...xs) - left,
    height = Math.max(...ys) - top;
  const scale = Math.min(480 / Math.max(width, 0.01), 280 / Math.max(height, 0.01)) * view.zoom;
  const points = raw.map((p) => ({
    id: p.id,
    x: 300 + (p.x - left - width / 2) * scale,
    y: 190 + (p.y - top - height / 2) * scale,
  }));
  const ids = new Set(points.map((p) => p.id));
  const edges = diagram.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const labels = model.lengths.map(({ a, b, text }) => {
    const p = points.find((p) => p.id === a)!,
      q = points.find((p) => p.id === b)!;
    return { text, x: (p.x + q.x) / 2 + 8, y: (p.y + q.y) / 2 + 15 };
  });
  labels.push({ text: model.angle, x: 30, y: 365 });
  return { points, edges, labels, view };
}
export function prepareConstrainedDiagram(
  diagram: CandidateDiagram,
  text: string,
  view = diagram.view ?? DEFAULT_DIAGRAM_VIEW,
) {
  const { model, error } = constrainedSolid(text);
  if (error) throw new Error(error);
  return model ? projectSolid(model, diagram, view) : keepMidpoints(diagram, text);
}
export function unsupportedSpatialReason(text: string) {
  if (constrainedSolid(text).model) return '';
  if (/棱锥|棱柱|正方体|长方体|四面体|空间|二面角/.test(text))
    return '此空间题尚无经过验证的约束模型，不能保证长度与空间角。请保留原照片，暂不应用自由点线图。';
  return /等边|等腰|正方形|矩形|圆|平行|垂直|∥|⊥|[A-Z]{2}\s*=|(?:∠|角)[A-Z]{3}\s*=/.test(
    normalized(text),
  )
    ? '本题还有未覆盖的长度、角度或形状约束，暂不允许应用自由点线图。请保留原照片。'
    : '';
}
