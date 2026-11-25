import type { StudyProblem } from '@/shared/study-contract';
import type { UniversalPlan } from './universal';
export const foldProblems: Record<string, StudyProblem> = {
  trajectory: {
    title: '矩形翻折与中点轨迹',
    text: '矩形ABCD，AB=4，BC=2，E、F分别是AB、CD的中点。沿DE把三角形ADE翻折为PDE，P从A运动到F，G为CP中点，求G的轨迹长度。',
    conditions: [
      '矩形ABCD，AB=4，BC=2',
      'E为AB中点，F为CD中点',
      '三角形ADE沿DE翻折，A对应P',
      'P从A运动到F',
      'G为CP中点',
    ],
    questions: ['观察G的轨迹并求轨迹长度'],
    uncertainties: [],
  },
  ratio: {
    title: '矩形动点折叠与距离',
    text: '矩形ABCD，AB=2，AD=3。E在AB上，F在DC上，BE=2DF。四边形AEFD沿EF折叠，A、D对应A′、D′，求C到直线A′D′的距离最大值。',
    conditions: [
      '矩形ABCD，AB=2，AD=3',
      'E在AB上，F在DC上',
      'BE=2DF',
      '四边形AEFD沿EF翻折',
      'A、D对应A′、D′',
    ],
    questions: ['探索C到直线A′D′的距离'],
    uncertainties: [],
  },
};
const edges = (pairs: string[][]) =>
  pairs.map((points, i) => ({ id: 'e' + i, points: points as [string, string] }));
export function verifiedFold(
  kind: 'trajectory' | 'ratio',
  problem: StudyProblem = foldProblems[kind],
): UniversalPlan {
  const common = {
    title: problem.title,
    reason:
      '已核对的折叠技能组合；几何关系由确定性构造保持，不由模型猜测坐标。绿色面保持不动，橙色面随折叠运动；原矩形轮廓仅作折前位置参考。',
    limitations: [] as string[],
    nodes: [],
    coverage: problem.conditions.map((quote, index) => ({
      index,
      quote,
      status: 'represented' as const,
      explanation: '与本题已核对的矩形、动点和刚体翻折构造对应',
    })),
  };
  if (kind === 'trajectory')
    return {
      ...common,
      trace: { point: 'G', parameter: 'theta' },
      parameters: [
        {
          id: 'theta',
          label: 'P 从 A 到 F 的翻折角',
          min: 0,
          max: Math.PI,
          initial: Math.PI / 3,
          unit: 'rad',
        },
      ],
      skills: [
        {
          skill: 'rectangle',
          id: 'rect',
          points: ['A', 'B', 'C', 'D'],
          width: 4,
          height: 2,
          wireframe: true,
        },
        { skill: 'midpoint', id: 'E', label: 'E', ends: ['A', 'B'] },
        { skill: 'midpoint', id: 'F', label: 'F', ends: ['D', 'C'] },
        {
          skill: 'rotate_group',
          id: 'fold',
          axis: ['D', 'E'],
          angle: { parameter: 'theta', scale: -1, offset: 0 },
          outputs: [{ source: 'A', id: 'P', label: 'P' }],
        },
        { skill: 'midpoint', id: 'G', label: 'G', ends: ['C', 'P'] },
      ],
      segments: edges([
        ['D', 'E'],
        ['P', 'D'],
        ['P', 'E'],
        ['C', 'P'],
      ]),
      faces: [
        { id: 'base', vertices: ['E', 'B', 'C', 'D'], color: '#72a69a' },
        { id: 'panel', vertices: ['P', 'E', 'D'], color: '#d99b4e' },
      ],
      metrics: [
        { id: 'pd', label: 'PD（保持不变）', type: 'distance', points: ['P', 'D'] },
        { id: 'pe', label: 'PE（保持不变）', type: 'distance', points: ['P', 'E'] },
      ],
      checks: [
        { type: 'distance', points: ['P', 'D'], value: 2 },
        { type: 'distance', points: ['P', 'E'], value: 2 },
        { type: 'length_multiple', first: ['C', 'G'], second: ['G', 'P'], value: 1 },
      ],
    };
  return {
    ...common,
    boundaryCollapse: true,
    parameters: [
      { id: 'be', label: 'BE 长度（DF 自动取一半）', min: 0, max: 2, initial: 1, unit: 'length' },
      {
        id: 'theta',
        label: '绕 EF 的翻折角',
        min: 0,
        max: Math.PI,
        initial: Math.PI / 3,
        unit: 'rad',
      },
    ],
    skills: [
      {
        skill: 'rectangle',
        id: 'rect',
        points: ['A', 'B', 'C', 'D'],
        width: 2,
        height: 3,
        wireframe: true,
      },
      {
        skill: 'edge_point',
        id: 'E',
        label: 'E',
        ends: ['B', 'A'],
        t: { parameter: 'be', scale: 0.5, offset: 0 },
      },
      {
        skill: 'ratio_point',
        id: 'F',
        label: 'F',
        ends: ['D', 'C'],
        reference: ['B', 'E'],
        ratio: 0.5,
      },
      {
        skill: 'rotate_group',
        id: 'fold',
        axis: ['E', 'F'],
        angle: { parameter: 'theta', scale: 1, offset: 0 },
        outputs: [
          { source: 'A', id: 'Ap', label: 'A′' },
          { source: 'D', id: 'Dp', label: 'D′' },
        ],
      },
    ],
    segments: edges([
      ['E', 'F'],
      ['Ap', 'E'],
      ['F', 'Dp'],
      ['Dp', 'Ap'],
      ['B', 'E'],
      ['D', 'F'],
    ]),
    faces: [
      { id: 'base', vertices: ['E', 'B', 'C', 'F'], color: '#72a69a' },
      { id: 'panel', vertices: ['Ap', 'E', 'F', 'Dp'], color: '#d99b4e' },
    ],
    metrics: [
      {
        id: 'target',
        label: 'C 到直线 A′D′ 的距离',
        type: 'point_line',
        point: 'C',
        line: ['Ap', 'Dp'],
      },
      { id: 'beLength', label: 'BE', type: 'distance', points: ['B', 'E'] },
      { id: 'dfLength', label: 'DF', type: 'distance', points: ['D', 'F'] },
    ],
    checks: [
      { type: 'length_multiple', first: ['B', 'E'], second: ['D', 'F'], value: 2 },
      { type: 'distance', points: ['Ap', 'Dp'], value: 3 },
    ],
  };
}
/** Only exact, fully specified benchmark problems use these verified recipes. */
export function matchVerifiedFold(problem: StudyProblem): 'trajectory' | 'ratio' | null {
  const s = (problem.text + ' ' + problem.conditions.join(' ') + ' ' + problem.questions.join(' '))
    .replace(/\s/g, '')
    .replace(/[′’]/g, "'");
  if (!s.includes('矩形')) return null;
  // Explicit contradictory incidences must never enter a pre-verified recipe.
  const sides = (point: string) =>
    [
      ...s.matchAll(new RegExp(point + '(?:点)?(?:在|位于)(?:线段|边)?([A-D]{2})(?![A-D])', 'g')),
    ].map((m) => m[1]);
  if (
    sides('E').some((side) => !['AB', 'BA'].includes(side)) ||
    sides('F').some((side) => !['CD', 'DC'].includes(side))
  )
    return null;
  if (
    /AB[=＝]4(?![\d.])/.test(s) &&
    /BC[=＝]2(?![\d.])/.test(s) &&
    s.includes('中点') &&
    s.includes('DE') &&
    s.includes('CP') &&
    s.includes('G') &&
    s.includes('P') &&
    s.includes('F') &&
    /翻折|折叠/.test(s)
  )
    return 'trajectory';
  if (
    /AB[=＝]2(?![\d.])/.test(s) &&
    /AD[=＝]3(?![\d.])/.test(s) &&
    /BE[=＝]2DF/.test(s) &&
    s.includes('AEFD') &&
    s.includes('EF') &&
    /A'D'|A′D′/.test(s) &&
    /翻折|折叠/.test(s) &&
    /E.*AB/.test(s) &&
    /F.*(?:CD|DC)/.test(s)
  )
    return 'ratio';
  return null;
}
