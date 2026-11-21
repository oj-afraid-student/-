import { parseScene } from './constraints';
import type { GeometryScene, Vec3 } from './scene';

const points = (data: Record<string, Vec3>) =>
  Object.entries(data).map(([id, initial]) => ({ id, label: id === 'A' ? 'A′' : id, initial }));
export const foldScene = parseScene({
  version: '1.0',
  id: 'square-fold',
  title: '沿一条折痕，看平面走向空间',
  facts: [
    '正方形 ABCD 的边长为 4。',
    'E 是折前线段 A₀B 的中点。',
    '三角形 A₀DE 沿 DE 翻折，底面 EBCD 固定。',
  ],
  assumptions: ['以原正方形为 xy 平面，折向 z ≥ 0；坐标朝向不影响长度。'],
  points: points({ A: [0, 0, 0], B: [4, 0, 0], C: [4, 4, 0], D: [0, 4, 0], E: [2, 0, 0] }),
  segments: [
    ['A', 'D'],
    ['A', 'E'],
    ['D', 'E'],
    ['E', 'B'],
    ['B', 'C'],
    ['C', 'D'],
  ].map(([a, b]) => ({ id: a + b, points: [a, b] })),
  faces: [
    { id: 'panel', vertices: ['A', 'E', 'D'], color: '#d99b4e' },
    { id: 'base', vertices: ['E', 'B', 'C', 'D'], color: '#72a69a' },
  ],
  constraints: [
    { type: 'fixed', points: ['B', 'C', 'D', 'E'] },
    { type: 'rigid', face: 'panel' },
    { type: 'rigid', face: 'base' },
    { type: 'initial_midpoint', point: 'E', of: ['A', 'B'] },
  ],
  // D→E with positive right-hand rotation sends A below xy; use sign=-1.
  motion: {
    type: 'hinge',
    axis: ['D', 'E'],
    moving: ['A'],
    sign: -1,
    min: 0,
    max: Math.PI / 2,
    initial: Math.PI / 6,
  },
  metrics: [
    {
      id: 'height',
      label: 'A′ 到底面 BCD 的距离',
      type: 'height',
      point: 'A',
      plane: ['B', 'C', 'D'],
    },
    { id: 'lengthAB', label: 'A′B 长度', type: 'distance', points: ['A', 'B'] },
  ],
});

// Sprint 0 static fixtures. Parameterized B/C tools are intentionally later work.
export const boxScene: GeometryScene = parseScene({
  version: '1.0',
  id: 'box',
  title: '长方体（静态 fixture）',
  facts: ['长方体边长 4、3、2。'],
  assumptions: [],
  points: points({
    A: [0, 0, 0],
    B: [4, 0, 0],
    C: [4, 3, 0],
    D: [0, 3, 0],
    P: [0, 0, 2],
    Q: [4, 0, 2],
    R: [4, 3, 2],
    S: [0, 3, 2],
  }),
  segments: [],
  faces: [
    { id: 'bottom', vertices: ['A', 'B', 'C', 'D'], color: '#72a69a' },
    { id: 'top', vertices: ['P', 'Q', 'R', 'S'], color: '#d99b4e' },
  ],
  constraints: [{ type: 'fixed', points: ['A', 'B', 'C', 'D', 'P', 'Q', 'R', 'S'] }],
  metrics: [],
});
export const pyramidScene: GeometryScene = parseScene({
  version: '1.0',
  id: 'pyramid',
  title: '三棱锥（静态 fixture）',
  facts: ['A=(0,0,3)，B=(0,0,0)，C=(4,0,0)，D=(0,4,0)。', 'E 为 AB 中点。'],
  assumptions: [],
  points: points({ A: [0, 0, 3], B: [0, 0, 0], C: [4, 0, 0], D: [0, 4, 0], E: [0, 0, 1.5] }),
  segments: [],
  faces: [
    { id: 'bottom', vertices: ['B', 'C', 'D'], color: '#72a69a' },
    { id: 'side', vertices: ['A', 'C', 'D'], color: '#d99b4e' },
  ],
  constraints: [
    { type: 'fixed', points: ['A', 'B', 'C', 'D', 'E'] },
    { type: 'initial_midpoint', point: 'E', of: ['A', 'B'] },
  ],
  metrics: [
    { id: 'height', label: 'E 到 BCD 的距离', type: 'height', point: 'E', plane: ['B', 'C', 'D'] },
  ],
});
