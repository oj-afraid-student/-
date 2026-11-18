import { z } from 'zod';
import type { StudyProblem } from '@/shared/study-contract';
import { metricSchema } from './scene';
import { foldScene, boxScene } from './fixtures';
import { parseScene, evaluateScene } from './constraints';
export const planSchema = z
  .object({
    template: z.enum(['square_fold', 'box', 'unsupported']),
    reason: z.string().max(2000),
    dimensions: z.array(z.number().finite().positive().min(0.01).max(1000)).max(3),
    evidence: z.array(z.string().max(2000)).max(10),
    labels: z.record(z.string(), z.string().min(1).max(20)).optional(),
    metrics: z.array(metricSchema).max(12).optional(),
    coverage: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            quote: z.string().min(1).max(1000),
            status: z.enum(['represented', 'unresolved']),
            explanation: z.string().max(1000),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    missing: z.array(z.string().max(1000)).max(10),
  })
  .strict();
export type GeometryPlan = z.infer<typeof planSchema>;
export function compilePlan(value: unknown) {
  const plan = planSchema.parse(value);
  if (plan.template === 'unsupported' || plan.missing.length) return null;
  if (plan.template === 'square_fold' && plan.dimensions.length !== 1)
    throw new Error('折叠模板需要一个边长');
  if (plan.template === 'box' && plan.dimensions.length !== 3)
    throw new Error('长方体需要三个边长');
  const scene = structuredClone(plan.template === 'square_fold' ? foldScene : boxScene);
  scene.title = plan.template === 'square_fold' ? '本题：正方形中点折叠' : '本题：长方体';
  scene.facts = plan.evidence.slice(0, 20).map((x) => x.slice(0, 300));
  const scale =
    plan.template === 'square_fold'
      ? [plan.dimensions[0] / 4, plan.dimensions[0] / 4, plan.dimensions[0] / 4]
      : [plan.dimensions[0] / 4, plan.dimensions[1] / 3, plan.dimensions[2] / 2];
  scene.points.forEach((p) => {
    p.initial = p.initial.map((x, i) => x * scale[i]) as [number, number, number];
    if (plan.template === 'box') p.label = p.id;
  });
  if (plan.template === 'box') {
    scene.assumptions = ['模板点名：底面 ABCD，上面 PQRS；请人工对照原题对应关系。'];
    scene.segments = ['AB', 'BC', 'CD', 'DA', 'PQ', 'QR', 'RS', 'SP', 'AP', 'BQ', 'CR', 'DS'].map(
      (s) => ({ id: s, points: [s[0], s[1]] }),
    );
    scene.faces.push(
      ...[
        ['A', 'B', 'Q', 'P'],
        ['B', 'C', 'R', 'Q'],
        ['C', 'D', 'S', 'R'],
        ['D', 'A', 'P', 'S'],
      ].map((vertices, i) => ({ id: 'side' + i, vertices, color: '#72a69a' })),
    );
    scene.metrics = [
      { id: 'diagonal', label: '体对角线 AR', type: 'distance', points: ['A', 'R'] },
    ];
  }
  if (plan.labels) {
    scene.points.forEach((p) => {
      if (plan.labels?.[p.id]) p.label = plan.labels[p.id];
    });
  }
  if (plan.metrics?.length) scene.metrics = plan.metrics;
  const result = parseScene(scene);
  for (let i = 0; i <= 90; i++) evaluateScene(result, ((result.motion?.max ?? 0) * i) / 90);
  return result;
}

/** Evidence coverage is mechanical; semantic correspondence still needs human confirmation. */
export function auditPlan(plan: GeometryPlan, problem: StudyProblem) {
  const issues: string[] = [];
  if (problem.uncertainties.length) issues.push('请先处理识别结果中的不确定项');
  const coverage = plan.coverage ?? [];
  for (let i = 0; i < problem.conditions.length; i++) {
    const rows = coverage.filter((c) => c.index === i);
    if (
      rows.length !== 1 ||
      rows[0].quote !== problem.conditions[i] ||
      rows[0].status !== 'represented'
    )
      issues.push('条件 ' + (i + 1) + ' 尚未完整映射到模型');
  }
  if (coverage.some((c) => c.index >= problem.conditions.length)) issues.push('存在无效条件引用');
  const source = problem.text + '\n' + problem.conditions.join('\n');
  if (!plan.evidence.length || plan.evidence.some((e) => !source.includes(e)))
    issues.push('规划证据必须逐字来自原题');
  const ids =
    plan.template === 'box' ? ['A', 'B', 'C', 'D', 'P', 'Q', 'R', 'S'] : ['A', 'B', 'C', 'D', 'E'];
  if (
    !plan.labels ||
    ids.some((id) => !plan.labels?.[id]) ||
    Object.keys(plan.labels).some((id) => !ids.includes(id)) ||
    new Set(Object.values(plan.labels ?? {})).size !== ids.length
  )
    issues.push('点名映射不完整或重复');
  return [...new Set(issues)];
}
