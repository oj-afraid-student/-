import { distance, dot, projectToPlane, sub, unit } from './geometry';
import type { Metric, Positions } from './scene';

export type Measurement =
  | { value: number; unit: '长度单位' | '°'; reason?: never }
  | { value?: never; unit?: never; reason: string };
export function evaluateMetrics(metrics: Metric[], p: Positions): Record<string, Measurement> {
  return Object.fromEntries(
    metrics.map((m) => {
      try {
        let value: number;
        if (m.type === 'distance') value = distance(p[m.points[0]], p[m.points[1]]);
        else if (m.type === 'height')
          value = distance(
            p[m.point],
            projectToPlane(p[m.point], p[m.plane[0]], p[m.plane[1]], p[m.plane[2]]),
          );
        else {
          const [a, b] = m.lines.map(([a, b]) => unit(sub(p[b], p[a])));
          value = (Math.acos(Math.min(1, Math.max(0, Math.abs(dot(a, b))))) * 180) / Math.PI;
        }
        if (!Number.isFinite(value)) throw new Error('量测结果不是有限数值。');
        return [m.id, { value, unit: m.type === 'line_angle' ? '°' : '长度单位' }];
      } catch (error) {
        return [m.id, { reason: error instanceof Error ? error.message : '无法计算此量测。' }];
      }
    }),
  );
}
