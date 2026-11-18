import { z } from 'zod';
import { foldScene, boxScene } from './fixtures';
import { parseScene, evaluateScene } from './constraints';
export const planSchema = z
  .object({
    template: z.enum(['square_fold', 'box', 'unsupported']),
    reason: z.string().max(2000),
    dimensions: z.array(z.number().finite().positive().min(0.01).max(1000)).max(3),
    evidence: z.array(z.string().max(2000)).max(10),
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
  const result = parseScene(scene);
  for (let i = 0; i <= 90; i++) evaluateScene(result, ((result.motion?.max ?? 0) * i) / 90);
  return result;
}
