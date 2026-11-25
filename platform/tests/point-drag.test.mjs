import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { verifiedFold } = await import('../src/features/geometry/verified-folds.ts');
const { pointDragBindings, buildPointDragPath, planDisplayTransform, nearestDragSample } =
  await import('../src/features/geometry/point-drag.ts');
const { evaluateUniversal } = await import('../src/features/geometry/universal.ts');
test('drag handles choose edge parameters and folding angles without freeing fixed points', () => {
  const b = pointDragBindings(verifiedFold('ratio'));
  assert.equal(b.E, 'be');
  assert.equal(b.F, 'be');
  assert.equal(b.Ap, 'theta');
  assert.equal(b.Dp, 'theta');
  assert.equal(b.A, undefined);
});
test('drag path preserves ratio at all samples including endpoints', () => {
  const plan = verifiedFold('ratio');
  const path = buildPointDragPath(plan, { be: 1, theta: 1 }, 'E', 'be');
  assert.equal(path.samples.length, 201);
  for (const s of path.samples) {
    const e = evaluateUniversal(plan, { be: s.value, theta: 1 });
    assert.ok(e.residual < 1e-8);
    assert.deepEqual(s.position, e.positions.E);
  }
  assert.equal(path.samples[0].value, 0);
  assert.equal(path.samples.at(-1).value, 2);
});
test('fold handles reach F and display transform stays constant', () => {
  const plan = verifiedFold('trajectory');
  const path = buildPointDragPath(plan, {}, 'P', 'theta');
  const end = evaluateUniversal(plan, { theta: Math.PI }).positions.F;
  assert.ok(Math.hypot(...path.samples.at(-1).position.map((x, i) => x - end[i])) < 1e-8);
  const transform = planDisplayTransform(plan);
  assert.deepEqual(transform(end), transform(end));
});
test('nearest projected sample clamps to endpoints and avoids arbitrary branch jumps', () => {
  const samples = [
    { x: 0, y: 0, value: 0 },
    { x: 10, y: 0, value: 1 },
    { x: 0, y: 0, value: 2 },
  ];
  assert.equal(nearestDragSample(samples, 0, 0, 1.9).value, 2);
  assert.equal(nearestDragSample(samples, 100, 0, 1).value, 1);
});
