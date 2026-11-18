import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { compilePlan } = await import('../src/features/geometry/planner.ts');
const { evaluateScene } = await import('../src/features/geometry/constraints.ts');
const base = { reason: 'test', evidence: ['原题条件'], missing: [] };
test('planner scales fold geometry and validates whole range', () => {
  const s = compilePlan({ ...base, template: 'square_fold', dimensions: [8] });
  assert.equal(s.points.find((p) => p.id === 'B').initial[0], 8);
  for (let d = 0; d <= 90; d++) assert.ok(evaluateScene(s, (d * Math.PI) / 180).residual < 1e-9);
});
test('planner box diagonal, unsupported fallback and invalid dimensions', () => {
  const s = compilePlan({ ...base, template: 'box', dimensions: [3, 4, 12] });
  assert.equal(evaluateScene(s, 0).metrics.diagonal.value, 13);
  assert.equal(compilePlan({ ...base, template: 'unsupported', dimensions: [] }), null);
  assert.equal(
    compilePlan({ ...base, template: 'box', dimensions: [3, 4, 12], missing: ['高未知'] }),
    null,
  );
  assert.throws(() => compilePlan({ ...base, template: 'box', dimensions: [3] }));
  assert.throws(() => compilePlan({ ...base, template: 'box', dimensions: [0, 4, 12] }));
});
