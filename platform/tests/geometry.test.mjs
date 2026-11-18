import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { foldScene, boxScene, pyramidScene } = await import('../src/features/geometry/fixtures.ts');
const { parseScene, evaluateScene, initialPositions, validateConstraints } =
  await import('../src/features/geometry/constraints.ts');
const { distance, foldRigidPanel } = await import('../src/features/geometry/geometry.ts');
const { evaluateMetrics } = await import('../src/features/geometry/metrics.ts');
const { connectPoints, historyReducer } = await import('../src/features/geometry/interactions.ts');

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
test('fold: golden angles and 901 samples preserve rigid lengths, fixed base, positive z and analytic metrics', () => {
  const initial = initialPositions(foldScene);
  for (let degree = 0; degree <= 90; degree += 0.1) {
    const theta = (degree * Math.PI) / 180;
    const { positions: p, metrics, residual } = evaluateScene(foldScene, theta);
    for (const id of ['B', 'C', 'D', 'E']) assert.deepEqual(p[id], initial[id]);
    close(distance(p.A, p.D), 4);
    close(distance(p.A, p.E), 2);
    close(distance(p.D, p.E), Math.sqrt(20));
    // Independent analytic derivation: foot of A0 on DE is (1.6, .8, 0).
    close(p.A[0], 1.6 * (1 - Math.cos(theta)));
    close(p.A[1], 0.8 * (1 - Math.cos(theta)));
    close(p.A[2], (4 / Math.sqrt(5)) * Math.sin(theta));
    close(metrics.height.value, (4 / Math.sqrt(5)) * Math.sin(theta));
    close(metrics.lengthAB.value, Math.sqrt(9.6 + 6.4 * Math.cos(theta)));
    assert.ok(residual < 1e-9);
  }
  for (const degree of [0, 15, 30, 45, 60, 75, 90])
    assert.doesNotThrow(() => evaluateScene(foldScene, (degree * Math.PI) / 180));
  close(evaluateScene(foldScene, (30 * Math.PI) / 180).metrics.height.value, 2 / Math.sqrt(5));
  close(
    evaluateScene(foldScene, (75 * Math.PI) / 180).metrics.height.value,
    (Math.sqrt(6) + Math.sqrt(2)) / Math.sqrt(5),
  );
});
test('schema rejects scripts, invalid references, duplicate ids, nonconvex faces, impossible constraints and invalid parameters', () => {
  const mutated = (fn) => {
    const s = structuredClone(foldScene);
    fn(s);
    return s;
  };
  assert.throws(() => parseScene({ ...foldScene, script: 'alert(1)' }));
  assert.throws(() => parseScene(mutated((s) => (s.motion.axis[0] = 'missing'))));
  assert.throws(() => parseScene(mutated((s) => (s.points[1].id = 'A'))));
  assert.throws(() => parseScene(mutated((s) => (s.faces[1].vertices = ['E', 'C', 'B', 'D']))));
  assert.throws(() => parseScene(mutated((s) => (s.points[4].initial = [3, 0, 0]))));
  for (const theta of [-1, Math.PI, NaN, Infinity])
    assert.throws(() => evaluateScene(foldScene, theta));
  const p = initialPositions(foldScene);
  p.A = [0, 0, 1];
  assert.throws(() => validateConstraints(foldScene, p));
});
test('degenerate metrics give reasons, never NaN; line angle uses the acute branch', () => {
  const p = { A: [0, 0, 0], B: [0, 0, 0], C: [1, 0, 0], D: [0, 1, 0] };
  const results = evaluateMetrics(
    [
      { id: 'h', label: '', type: 'height', point: 'D', plane: ['A', 'B', 'C'] },
      {
        id: 'a',
        label: '',
        type: 'line_angle',
        lines: [
          ['A', 'B'],
          ['A', 'C'],
        ],
      },
      {
        id: 'right',
        label: '',
        type: 'line_angle',
        lines: [
          ['A', 'C'],
          ['D', 'A'],
        ],
      },
    ],
    p,
  );
  assert.ok(results.h.reason);
  assert.equal(results.h.value, undefined);
  assert.ok(results.a.reason);
  close(results.right.value, 90);
  assert.throws(() => foldRigidPanel(p, ['A', 'B'], ['D'], 0.5));
});
test('auxiliary segments store live references, reject duplicates and follow undo/redo/reset', () => {
  const constructions = connectPoints(foldScene, [], ['A', 'C']);
  assert.deepEqual(constructions[0].points, ['A', 'C']);
  assert.throws(() => connectPoints(foldScene, constructions, ['C', 'A']));
  assert.throws(() => connectPoints(foldScene, [], ['A', 'D']));
  assert.throws(() => connectPoints(foldScene, [], ['A', 'A']));
  const lengths = [30, 75].map((d) => {
    const p = evaluateScene(foldScene, (d * Math.PI) / 180).positions;
    return distance(...constructions[0].points.map((id) => p[id]));
  });
  assert.notEqual(lengths[0], lengths[1]);
  const start = { theta: 0, constructions: [] };
  let h = { past: [], present: start, future: [] };
  h = historyReducer(h, { type: 'commit', value: { theta: 0.5, constructions } });
  h = historyReducer(h, { type: 'undo' });
  assert.deepEqual(h.present, start);
  h = historyReducer(h, { type: 'redo' });
  assert.equal(h.present.constructions.length, 1);
  h = historyReducer(h, { type: 'reset', value: start });
  assert.deepEqual(h, { past: [], present: start, future: [] });
});
test('three offline fixtures pass schema and deterministic evaluation', () => {
  for (const s of [foldScene, boxScene, pyramidScene])
    assert.doesNotThrow(() => evaluateScene(parseScene(s), s.motion?.initial ?? 0));
});
