import type { Positions, Vec3 } from './scene';

export const EPS = 1e-9;
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(...a);
export const distance = (a: Vec3, b: Vec3) => norm(sub(a, b));
export function unit(a: Vec3): Vec3 {
  const length = norm(a);
  if (!Number.isFinite(length) || length < EPS)
    throw new Error('退化几何：零长度方向或共线点不能定义轴/平面。');
  return scale(a, 1 / length);
}
export function planeNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return unit(cross(unit(sub(b, a)), unit(sub(c, a))));
}
export function projectToPlane(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const n = planeNormal(a, b, c);
  return sub(p, scale(n, dot(sub(p, a), n)));
}
/** Rodrigues rotation, always from the initial coordinates; no incremental drift. */
export function foldRigidPanel(
  initial: Positions,
  axis: [string, string],
  moving: string[],
  angle: number,
): Positions {
  if (!Number.isFinite(angle)) throw new Error('折叠角必须是有限数值。');
  const origin = initial[axis[0]];
  const k = unit(sub(initial[axis[1]], origin));
  const result = { ...initial };
  for (const id of moving) {
    const v = sub(initial[id], origin);
    result[id] = add(
      origin,
      add(
        add(scale(v, Math.cos(angle)), scale(cross(k, v), Math.sin(angle))),
        scale(k, dot(k, v) * (1 - Math.cos(angle))),
      ),
    );
  }
  return result;
}
