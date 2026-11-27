import './helpers/server-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { validateUniversal, evaluateUniversal } =
  await import('../src/features/geometry/universal.ts');
const { studioExample } = await import('../src/features/geometry/studio-examples.ts');
const { planDisplayTransform } = await import('../src/features/geometry/point-drag.ts');
const { problem, plan: cone } = studioExample('cone');
for (const type of ['cone', 'cylinder', 'sphere', 'hemisphere']) {
  test(type + ' skill emits a renderable surface and correct reference points', () => {
    const plan = {
      ...cone,
      checks: [],
      metrics: [],
      segments: [],
      skills: [
        {
          skill: type,
          id: 'shape',
          radius: 3,
          ...(['cone', 'cylinder'].includes(type) ? { height: 4 } : {}),
          points: ['O', 'R', 'T'],
          origin: [3, 2, 1],
        },
      ],
    };
    validateUniversal(plan, problem);
    const { scene, positions } = evaluateUniversal(plan, {});
    assert.equal(scene.solids[0].type, type);
    assert.deepEqual(positions.R, [6, 2, 1]);
    assert.deepEqual(positions.T, [3, 2, ['cone', 'cylinder'].includes(type) ? 5 : 4]);
    assert.ok(planDisplayTransform(plan));
    assert.throws(() =>
      validateUniversal({ ...plan, skills: [{ ...plan.skills[0], radius: 0 }] }, problem),
    );
  });
}
test('rhombic prism preserves line-plane parallelism and has perpendicular solution only at midpoint', () => {
  const plan = {
    ...cone,
    nodes: [],
    segments: [],
    checks: [{ type: 'line_plane_parallel', line: ['D', 'P'], plane: ['A', 'B1', 'D1'] }],
    parameters: [{ id: 't', label: 'BP/BC₁', unit: 'ratio', min: 0, max: 1, initial: 0.5 }],
    skills: [
      {
        skill: 'right_rhombic_prism',
        id: 'base',
        points: ['A', 'B', 'C', 'D', 'A1', 'B1', 'C1', 'D1'],
        side: 2,
        angleDegrees: 60,
        height: 3,
      },
      {
        skill: 'edge_point',
        id: 'P',
        label: 'P',
        ends: ['B', 'C1'],
        t: { parameter: 't', scale: 1, offset: 0 },
      },
    ],
    metrics: [
      {
        type: 'line_angle',
        id: 'target',
        label: 'BC 与 DP',
        lines: [
          ['B', 'C'],
          ['D', 'P'],
        ],
      },
    ],
  };
  validateUniversal(plan, problem);
  for (const t of [0, 0.33, 0.5, 0.77, 1]) {
    const result = evaluateUniversal(plan, { t });
    assert.equal(result.scene.faces.length, 6);
    assert.equal(Math.abs(result.metrics.target.value - 90) < 1e-8, t === 0.5);
  }
  assert.throws(() =>
    validateUniversal(
      {
        ...plan,
        checks: [{ type: 'line_plane_parallel', line: ['A', 'B1'], plane: ['A', 'B1', 'D1'] }],
      },
      problem,
    ),
  );
});
