import type { StudyProblem } from '@/shared/study-contract';
import type { UniversalPlan } from './universal';

// Cross-section through the midpoint of BD. The rays towards A and P
// enclose the prescribed interior dihedral angle.
export function rhombusSphere(problem: StudyProblem): UniversalPlan | null {
  const text = problem.text.replace(/\s/g, '').replace(/[－—–]/g, '-');
  const side = Number(/菱形ABCD的?边长(?:为|是|=)?(\d+(?:\.\d+)?)(?=[，,。；;])/.exec(text)?.[1]);
  if (
    !(side > 0 && side <= 1000) ||
    !/BAD[=＝为]60[°度]/.test(text) ||
    !/BCD沿(?:对角线)?BD翻折/.test(text) ||
    !/C到(?:点)?P/.test(text) ||
    !/二面角A-BD-P[为=＝]120[°度]/.test(text) ||
    !/外接球的?表面积/.test(text)
  )
    return null;
  const half = side / 2,
    height = half * Math.sqrt(3),
    radius = (side * Math.sqrt(21)) / 6;
  const point = (id: string, position: [number, number, number]) => ({
    type: 'fixed' as const,
    id,
    label: id,
    position,
  });
  const edges = ['AB', 'AD', 'BD', 'BC', 'CD', 'BP', 'DP', 'AP'];
  return {
    title: problem.title,
    reason:
      '以 BD 的中点为原点，BD 为横轴。在垂直 BD 的截面内取相差 120° 的两条射线定位 A 和 P。球心 O 到四个顶点等距。',
    parameters: [],
    limitations: [],
    nodes: [
      point('B', [-half, 0, 0]),
      point('D', [half, 0, 0]),
      point('A', [0, height, 0]),
      point('C', [0, -height, 0]),
      point('P', [0, -height / 2, (3 * side) / 4]),
      point('O', [0, height / 3, half]),
    ],
    segments: edges.map((pair) => ({ id: 's' + pair, points: [pair[0], pair[1]] })),
    faces: ['ABD', 'PBD', 'PAB', 'PAD'].map((v, i) => ({
      id: 'f' + i,
      vertices: v.split(''),
      color: i ? '#87bed9' : '#72a69a',
    })),
    solids: [{ id: 'sphere', type: 'sphere', center: 'O', radius, color: '#87bed9' }],
    checks: [
      ...edges
        .filter((v) => v !== 'AP')
        .map((v) => ({
          type: 'distance' as const,
          points: [v[0], v[1]] as [string, string],
          value: side,
        })),
      ...['A', 'B', 'D', 'P'].map((v) => ({
        type: 'distance' as const,
        points: ['O', v] as [string, string],
        value: radius,
      })),
    ],
    metrics: [{ id: 'radius', label: '外接球半径', type: 'distance', points: ['O', 'P'] }],
    coverage: problem.conditions.map((quote, index) => {
      const represented = /菱形|边长|BAD|二面角|翻折|折叠|C到|外接球/.test(quote);
      return {
        quote,
        index,
        status: represented ? 'represented' : 'unresolved',
        explanation: represented ? '由菱形及折后顶点的解析坐标表达' : '请单独核对该条件',
      };
    }),
  };
}
