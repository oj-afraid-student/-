import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constrainedSolid,
  keepMidpoints,
  prepareConstrainedDiagram,
  projectSolid,
  unsupportedSpatialReason,
} from '../src/shared/diagram-constraints.ts';
import { candidateDiagramSchema } from '../src/shared/candidate-diagram.ts';
const text =
  '在四棱锥P-ABCD中，△PAB是等边三角形，底面ABCD为等腰梯形，CD∥AB，AB=2，CD=1，AD=√3/2，∠PAD=30°。若E为PA的中点。求证平面PAD⊥平面ABCD；求二面角P-BD-E的余弦值。';
const diagram = {
  points: [
    { id: 'A', x: 70, y: 310 },
    { id: 'B', x: 530, y: 310 },
    { id: 'C', x: 430, y: 210 },
    { id: 'D', x: 220, y: 210 },
    { id: 'P', x: 150, y: 30 },
    { id: 'E', x: 260, y: 170 },
  ],
  edges: [
    { from: 'P', to: 'A', dashed: false },
    { from: 'A', to: 'B', dashed: false },
    { from: 'B', to: 'D', dashed: true },
  ],
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const norm = (a) => Math.sqrt(dot(a, a));
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
test('verified solid satisfies lengths, equilateral triangle, trapezoid, space angle, perpendicular planes and midpoint', () => {
  const result = constrainedSolid(text);
  assert.equal(result.error, undefined);
  const p = result.model.points;
  for (const [a, b, expected] of [
    ['P', 'A', 2],
    ['P', 'B', 2],
    ['A', 'B', 2],
    ['C', 'D', 1],
    ['A', 'D', Math.sqrt(3) / 2],
    ['B', 'C', Math.sqrt(3) / 2],
  ])
    close(norm(sub(p[a], p[b])), expected);
  close(norm(cross(sub(p.C, p.D), sub(p.B, p.A))), 0);
  close(
    dot(sub(p.P, p.A), sub(p.D, p.A)) / (norm(sub(p.P, p.A)) * norm(sub(p.D, p.A))),
    Math.cos(Math.PI / 6),
  );
  close(dot(cross(sub(p.P, p.A), sub(p.D, p.A)), [0, 0, 1]), 0);
  p.E.forEach((v, i) => close(v, (p.P[i] + p.A[i]) / 2));
  close(p.P[2], 1);
  // LaTeX fractions and roots produce exactly the same model, not a guessed ratio.
  assert.deepEqual(constrainedSolid(text.replace('√3/2', '\\frac{\\sqrt{3}}{2}')).model.points, p);
});
test('camera adjustments preserve projected midpoint and parallel ratio at every supported view', () => {
  const { model } = constrainedSolid(text);
  for (const yaw of [-80, -40, 0, 40, 80])
    for (const pitch of [10, 25, 50, 70])
      for (const zoom of [0.5, 0.85, 1]) {
        const result = projectSolid(model, diagram, { yaw, pitch, zoom });
        assert.equal(candidateDiagramSchema.safeParse(result).success, true);
        const p = Object.fromEntries(result.points.map((p) => [p.id, p]));
        for (const axis of ['x', 'y']) {
          close(p.E[axis], (p.P[axis] + p.A[axis]) / 2);
          close(p.C[axis] - p.D[axis], (p.B[axis] - p.A[axis]) / 2);
        }
      }
  const fixed = prepareConstrainedDiagram(diagram, text);
  assert.notEqual(fixed.points.find((p) => p.id === 'E').x, 260);
});
test('midpoints move with endpoints, including chained dependencies, and broken references cannot be applied', () => {
  const initial = {
    points: [
      { id: 'A', x: 100, y: 300 },
      { id: 'P', x: 300, y: 100 },
      { id: 'E', x: 400, y: 300 },
      { id: 'F', x: 400, y: 100 },
    ],
    edges: [
      { from: 'A', to: 'P', dashed: false },
      { from: 'A', to: 'E', dashed: false },
    ],
  };
  const caption = 'E为PA的中点，F为AE的中点';
  const fixed = keepMidpoints(initial, caption);
  assert.deepEqual(
    fixed.points.find((p) => p.id === 'E'),
    { id: 'E', x: 200, y: 200 },
  );
  assert.deepEqual(
    fixed.points.find((p) => p.id === 'F'),
    { id: 'F', x: 150, y: 250 },
  );
  initial.points[1].x = 500;
  assert.equal(keepMidpoints(initial, caption).points.find((p) => p.id === 'E').x, 300);
  assert.throws(
    () =>
      keepMidpoints({ ...initial, points: initial.points.filter((p) => p.id !== 'P') }, caption),
    /缺少端点/,
  );
  assert.throws(() => keepMidpoints(initial, 'E为FA的中点，F为EA的中点'), /循环/);
  assert.throws(() => keepMidpoints(initial, 'E为PA的中点，E为FA的中点'), /冲突/);
});
test('contradictory and unsupported constraints cannot be advertised as validated', () => {
  for (const invalid of [
    text + 'PA=3',
    text + '∠PAB=70°',
    text + 'E为PB的中点',
    text + 'AC⊥BD',
    text + 'PA⊥平面ABC',
    text.replace('√3/2', '1/10'),
    text.replace('30°', '150°'),
  ])
    assert.ok(constrainedSolid(invalid).error, invalid);
  assert.match(unsupportedSpatialReason('正方体ABCD-A1B1C1D1'), /尚无经过验证/);
  assert.match(unsupportedSpatialReason('等边三角形ABC，AB=2'), /未覆盖/);
  assert.equal(unsupportedSpatialReason(text), '');
});
