import type { StudyProblem } from '@/shared/study-contract';
import type { UniversalPlan } from './universal';
import { foldProblems, verifiedFold } from './verified-folds';
const fixed = (id: string, position: [number, number, number]) => ({
  id,
  label: id,
  type: 'fixed' as const,
  position,
});
export function studioExample(kind: string): { problem: StudyProblem; plan: UniversalPlan } {
  if (kind === 'trajectory' || kind === 'ratio')
    return { problem: foldProblems[kind], plan: verifiedFold(kind) };
  const cylinder = kind !== 'hemisphere';
  const title = cylinder ? '圆柱容器中的两个等径球' : '四个相切球与外罩半球';
  const conditions = cylinder
    ? ['圆柱底面半径为4，高为9', '两个球半径均为2.5，彼此外切', '两球分别与底面、顶面和侧面相切']
    : [
        '四个球半径均为2，与水平桌面相切',
        '球心投影构成边长4的正方形，相邻球外切',
        '半球中心位于正方形中心，内半径为2+2√3',
      ];
  const problem: StudyProblem = {
    title,
    text: conditions.join('。'),
    conditions,
    questions: [cylinder ? '观察球与圆柱的相切关系' : '观察半球与四个小球的内切关系'],
    uncertainties: [],
  };
  const radius = 2 + 2 * Math.sqrt(3);
  const nodes = cylinder
    ? [
        fixed('O1', [0, 0, 0]),
        fixed('O2', [0, 0, 9]),
        fixed('S1', [-1.5, 0, 2.5]),
        fixed('S2', [1.5, 0, 6.5]),
      ]
    : [
        fixed('O', [0, 0, 0]),
        ...[
          [-2, -2, 2],
          [2, -2, 2],
          [2, 2, 2],
          [-2, 2, 2],
        ].map((v, i) => fixed('C' + (i + 1), v as [number, number, number])),
        ...[
          [-6, -6, 0],
          [6, -6, 0],
          [6, 6, 0],
          [-6, 6, 0],
        ].map((v, i) => fixed('D' + (i + 1), v as [number, number, number])),
      ];
  const plan: UniversalPlan = {
    title,
    reason: '解析构造的曲面演示，可选择点进行动态量测。',
    limitations: ['此示例按给定尺寸构造；相切关系可用球心距离核对。'],
    parameters: [],
    nodes,
    segments: cylinder
      ? [{ id: 'axis', points: ['O1', 'O2'] }]
      : [
          ['C1', 'C2'],
          ['C2', 'C3'],
          ['C3', 'C4'],
          ['C4', 'C1'],
          ['O', 'C1'],
        ].map((points, i) => ({ id: 'edge' + i, points: points as [string, string] })),
    faces: cylinder ? [] : [{ id: 'table', vertices: ['D1', 'D2', 'D3', 'D4'], color: '#beddea' }],
    solids: cylinder
      ? [
          { id: 'container', type: 'cylinder', ends: ['O1', 'O2'], radius: 4, color: '#87bed9' },
          { id: 'ball1', type: 'sphere', center: 'S1', radius: 2.5, color: '#75abc6' },
          { id: 'ball2', type: 'sphere', center: 'S2', radius: 2.5, color: '#75abc6' },
        ]
      : [
          { id: 'cover', type: 'hemisphere', center: 'O', radius, color: '#d9ceb0' },
          ...[1, 2, 3, 4].map((i) => ({
            id: 'ball' + i,
            type: 'sphere' as const,
            center: 'C' + i,
            radius: 2,
            color: '#9db8ae',
          })),
        ],
    checks: cylinder
      ? [
          { type: 'distance', points: ['S1', 'S2'], value: 5 },
          { type: 'distance', points: ['O1', 'O2'], value: 9 },
        ]
      : [1, 2, 3, 4].map((i) => ({
          type: 'distance' as const,
          points: ['O', 'C' + i] as [string, string],
          value: 2 * Math.sqrt(3),
        })),
    metrics: [],
    coverage: conditions.map((quote, index) => ({
      index,
      quote,
      status: 'represented',
      explanation: '解析坐标与半径构造',
    })),
  };
  return { problem, plan };
}
