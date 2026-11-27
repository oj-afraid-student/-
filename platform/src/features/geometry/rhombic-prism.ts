import type { StudyProblem } from '@/shared/study-contract';
import type { UniversalPlan } from './universal';

export function rhombicPrismMotion(problem: StudyProblem): UniversalPlan | null {
  const normalize = (text: string) =>
    text
      .replace(/\\parallel/g, '平行')
      .replace(/\\perp/g, '⊥')
      .replace(/\\angle/g, '∠')
      .replace(/\\circ/g, '°')
      .replace(/₁/g, '1')
      .replace(/[\s${}_^]/g, '')
      .replace(/[。；;，,]$/, '');
  const statement = normalize(problem.text);
  if (
    !statement.includes('直四棱柱') ||
    !/ABCD.{0,4}菱形/.test(statement) ||
    !/DAB[=＝为]60°/.test(statement) ||
    !/P.{0,5}BC1上.{0,3}动点/.test(statement) ||
    !/DP(?:平行于?|∥)平面AB1D1/.test(statement) ||
    !/使(?:得)?BC(?:⊥|垂直于)DP/.test(statement)
  )
    return null;

  const explanations = [
    [/^在?直四棱柱ABCD[-－—]A1B1C1D1中?$/, '顶点沿底面法向平移得到直棱柱'],
    [/^(?:(?:四边形)?ABCD[是为]菱形|∠DAB[=＝为]60°)$/, '用边长和 60° 内角构造底面'],
    [/^(?:点?P[为是](?:线段)?BC1上的?动点|线段BC1上标注有点P)$/, 'P 随参数在线段 BC₁ 上移动'],
    [/^(?:图中)?画有辅助线AB1、AD1、AC、BD1$/, '连接 AB₁、AD₁、AC、BD₁'],
  ] as const;
  // Only specialize the dimension-free exercise. Extra givens go through the planner.
  if (
    problem.conditions.some((condition) => {
      const c = normalize(condition);
      return (
        !explanations.some(([pattern]) => pattern.test(c)) ||
        /[=＝](?!60°)|高为|边长为|体积|面积|中点|长度为/.test(c)
      );
    })
  )
    return null;
  return {
    title: problem.title,
    reason: '构造菱形底面的直棱柱，将 P 放在 BC₁ 上。移动 P，观察 BC 和 DP 的夹角何时为 90°。',
    limitations: ['原题未指定边长和高度，显示取底边长 2、高 3。'],
    parameters: [{ id: 't', label: 'BP / BC₁', unit: 'ratio', min: 0, max: 1, initial: 0.5 }],
    nodes: [],
    faces: [],
    skills: [
      {
        skill: 'right_rhombic_prism',
        id: 'prism',
        points: ['A', 'B', 'C', 'D', 'A1', 'B1', 'C1', 'D1'],
        side: 2,
        height: 3,
        angleDegrees: 60,
      },
      {
        skill: 'edge_point',
        id: 'P',
        label: 'P',
        ends: ['B', 'C1'],
        t: { parameter: 't', scale: 1, offset: 0 },
      },
    ],
    segments: [
      ['B', 'C1'],
      ['D', 'P'],
      ['A', 'B1'],
      ['A', 'D1'],
      ['A', 'C'],
      ['B', 'D1'],
    ].map(([a, b], i) => ({ id: 'aux' + i, points: [a, b] })),
    metrics: [
      {
        id: 'targetAngle',
        label: 'BC 与 DP 的夹角（目标 90°）',
        type: 'line_angle',
        lines: [
          ['B', 'C'],
          ['D', 'P'],
        ],
      },
    ],
    checks: [{ type: 'line_plane_parallel', line: ['D', 'P'], plane: ['A', 'B1', 'D1'] }],
    coverage: problem.conditions.map((quote, index) => ({
      quote,
      index,
      status: 'represented',
      explanation: explanations.find(([r]) => r.test(normalize(quote)))![1],
    })),
  };
}
