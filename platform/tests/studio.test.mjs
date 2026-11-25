import './helpers/server-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { studioExample } = await import('../src/features/geometry/studio-examples.ts');
const { evaluateUniversal, validateUniversal } =
  await import('../src/features/geometry/universal.ts');
const { addMidpoint, addFaceFold, measureObservation } =
  await import('../src/features/geometry/studio-tools.ts');
const { planDisplayTransform } = await import('../src/features/geometry/point-drag.ts');
for (const kind of ['cylinder', 'hemisphere', 'trajectory', 'ratio'])
  test('studio example validates: ' + kind, () => {
    const x = studioExample(kind);
    const r = validateUniversal(x.plan, x.problem);
    assert.ok(r.samples);
    assert.ok(planDisplayTransform(x.plan));
  });
test('sphere packing has correct tangencies', () => {
  const { plan } = studioExample('cylinder');
  const p = evaluateUniversal(plan, {}).positions;
  assert.equal(measureObservation({ kind: 'distance', points: ['S1', 'S2'] }, p), '5.0000');
  assert.equal(p.S1[2], 2.5);
  assert.equal(9 - p.S2[2], 2.5);
});
test('midpoint and selected-face fold are actual dependent geometry', () => {
  const { plan, problem } = studioExample('ratio');
  const added = addMidpoint(plan, ['B', 'C']);
  validateUniversal(added, problem);
  assert.deepEqual(evaluateUniversal(added, {}).positions.UserM1, [2, 1.5, 0]);
  const folded = addFaceFold(plan, 'base', ['B', 'C']);
  validateUniversal(folded, problem);
  const p0 = evaluateUniversal(folded, { userFold1: 0 }).positions,
    p1 = evaluateUniversal(folded, { userFold1: 1 }).positions;
  assert.notDeepEqual(p0.Fold1_E, p1.Fold1_E);
  assert.throws(() => addFaceFold(plan, 'base', ['A', 'D']));
});
test('measurement handles line/plane/angle and degenerate choices', () => {
  const p = { A: [0, 0, 0], B: [2, 0, 0], C: [0, 2, 0], D: [0, 0, 3] };
  assert.equal(measureObservation({ kind: 'height', points: ['D', 'A', 'B', 'C'] }, p), '3.0000');
  assert.equal(
    measureObservation({ kind: 'line_angle', points: ['A', 'B', 'A', 'C'] }, p),
    '90.0000°',
  );
  assert.equal(measureObservation({ kind: 'point_line', points: ['D', 'A', 'B'] }, p), '3.0000');
  assert.match(measureObservation({ kind: 'point_line', points: ['D', 'A', 'A'] }, p), /无法/);
});
