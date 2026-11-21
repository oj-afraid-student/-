export const problem = {
  title: '矩形动点折叠',
  text: '矩形ABCD，AB=2，AD=3，E在AB上，F在DC上，BE=2DF。四边形AEFD沿EF翻折，A、D对应Ap、Dp。研究C到直线ApDp的距离。',
  conditions: ['矩形ABCD，AB=2，AD=3', 'E在AB上，F在DC上，BE=2DF', '四边形AEFD沿EF翻折'],
  questions: ['研究C到直线ApDp的距离'],
  uncertainties: [],
};
const fixed = (id, position) => ({ id, label: id, type: 'fixed', position });
export const plan = {
  title: '矩形动点与翻折',
  reason: 'E和F通过同一参数联动，A和D绕同一轴旋转',
  limitations: ['参数排除退化端点；探索结果不等于最大值证明'],
  parameters: [
    { id: 't', label: '动点比例', min: 0.1, max: 0.9, initial: 0.5, unit: 'ratio' },
    { id: 'theta', label: '翻折角', min: 0, max: Math.PI, initial: 0.5, unit: 'rad' },
  ],
  nodes: [
    fixed('A', [0, 0, 0]),
    fixed('B', [2, 0, 0]),
    fixed('C', [2, 3, 0]),
    fixed('D', [0, 3, 0]),
    {
      id: 'E',
      label: 'E',
      type: 'lerp',
      ends: ['A', 'B'],
      t: { parameter: 't', scale: -1, offset: 1 },
    },
    {
      id: 'F',
      label: 'F',
      type: 'lerp',
      ends: ['D', 'C'],
      t: { parameter: 't', scale: 0.5, offset: 0 },
    },
    {
      id: 'Ap',
      label: 'A′',
      type: 'rotate',
      source: 'A',
      axis: ['E', 'F'],
      angle: { parameter: 'theta', scale: 1, offset: 0 },
    },
    {
      id: 'Dp',
      label: 'D′',
      type: 'rotate',
      source: 'D',
      axis: ['E', 'F'],
      angle: { parameter: 'theta', scale: 1, offset: 0 },
    },
  ],
  segments: [
    ['Ap', 'E'],
    ['E', 'B'],
    ['B', 'C'],
    ['C', 'F'],
    ['F', 'Dp'],
    ['Dp', 'Ap'],
    ['E', 'F'],
  ].map((points, i) => ({ id: 'edge' + i, points })),
  faces: [
    { id: 'moving', vertices: ['Ap', 'E', 'F', 'Dp'], color: '#d99b4e' },
    { id: 'base', vertices: ['E', 'B', 'C', 'F'], color: '#72a69a' },
  ],
  metrics: [
    { id: 'target', label: 'C到直线A′D′', type: 'point_line', point: 'C', line: ['Ap', 'Dp'] },
  ],
  checks: [
    { type: 'distance', points: ['A', 'B'], value: 2 },
    { type: 'distance', points: ['A', 'D'], value: 3 },
    { type: 'distance', points: ['Ap', 'Dp'], value: 3 },
    { type: 'ratio', first: ['B', 'E'], second: ['D', 'F'], value: 2 },
  ],
  coverage: problem.conditions.map((quote, index) => ({
    index,
    quote,
    status: 'represented',
    explanation: '显式坐标、线性比例和绕轴刚体旋转',
  })),
};
