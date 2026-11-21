import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { verifiedFold, foldProblems, matchVerifiedFold } =
  await import('../src/features/geometry/verified-folds.ts');
const { evaluateUniversal, validateUniversal } =
  await import('../src/features/geometry/universal.ts');
const { distance } = await import('../src/features/geometry/geometry.ts');
test('problem one: P follows semicircle A to F, G is midpoint with radius sqrt(2)/2', () => {
  const plan = verifiedFold('trajectory');
  validateUniversal(plan, foldProblems.trajectory);
  const start = evaluateUniversal(plan, { theta: 0 }).positions,
    end = evaluateUniversal(plan, { theta: Math.PI }).positions;
  assert.ok(distance(start.P, start.A) < 1e-9);
  assert.ok(distance(end.P, end.F) < 1e-9);
  let length = 0,
    previous = start.G;
  for (let i = 0; i <= 720; i++) {
    const e = evaluateUniversal(plan, { theta: (Math.PI * i) / 720 }),
      p = e.positions;
    assert.ok(e.residual < 1e-9);
    assert.ok(Math.abs(distance(p.C, p.G) - distance(p.G, p.P)) < 1e-9);
    length += distance(previous, p.G);
    previous = p.G;
  }
  assert.ok(Math.abs(length - Math.PI / Math.sqrt(2)) < 1e-5);
});
test('problem two: full closed BE and fold angle ranges preserve ratio and rigid edge; distance agrees with cross-product formula', () => {
  const plan = verifiedFold('ratio');
  validateUniversal(plan, foldProblems.ratio);
  for (let be = 0; be <= 2.0001; be += 0.05)
    for (let theta = 0; theta <= Math.PI + 0.001; theta += Math.PI / 36) {
      const e = evaluateUniversal(plan, { be: Math.min(2, be), theta: Math.min(Math.PI, theta) }),
        p = e.positions;
      assert.ok(e.residual < 1e-9);
      assert.ok(Math.abs(distance(p.B, p.E) - 2 * distance(p.D, p.F)) < 1e-9);
      const u = p.Dp.map((x, i) => x - p.Ap[i]),
        v = p.C.map((x, i) => x - p.Ap[i]);
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      assert.ok(Math.abs(e.metrics.target.value - Math.hypot(...cross) / Math.hypot(...u)) < 1e-9);
    }
});
test('benchmark selection requires matching dimensions and mechanism', () => {
  assert.equal(matchVerifiedFold(foldProblems.trajectory), 'trajectory');
  assert.equal(matchVerifiedFold(foldProblems.ratio), 'ratio');
  assert.equal(
    matchVerifiedFold({ ...foldProblems.ratio, text: '四面体', conditions: [], questions: [] }),
    null,
  );
});
