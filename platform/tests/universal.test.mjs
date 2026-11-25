import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, problem } from './universal-fixture.mjs';
const { validateUniversal, evaluateUniversal } =
  await import('../src/features/geometry/universal.ts');
test('generic rectangle moving hinge preserves ratio and rigidity across parameter combinations', () => {
  assert.equal(validateUniversal(plan, problem).samples, 25);
  for (let t = 0.1; t <= 0.9; t += 0.1)
    for (let theta = 0; theta <= Math.PI; theta += 0.1) {
      const e = evaluateUniversal(plan, { t, theta });
      assert.ok(e.residual < 1e-9);
      assert.ok(Number.isFinite(e.metrics.target.value));
    }
  const flat = evaluateUniversal(plan, { t: 0.5, theta: 0 });
  assert.ok(Math.abs(flat.metrics.target.value - 2) < 1e-9);
});
test('rejects arbitrary expressions, missing references, out of range controls and wrong constraints', () => {
  const bad = structuredClone(plan);
  bad.nodes[4].t = 'process.exit()';
  assert.throws(() => validateUniversal(bad, problem));
  const ref = structuredClone(plan);
  ref.nodes[4].ends[0] = 'missing';
  assert.throws(() => validateUniversal(ref, problem));
  assert.throws(() => evaluateUniversal(plan, { t: 1, theta: 0 }));
  const wrong = structuredClone(plan);
  wrong.checks[3].value = 3;
  assert.throws(() => validateUniversal(wrong, problem));
});
test('missing condition coverage remains explicitly unverified', () => {
  const r = validateUniversal({ ...plan, coverage: [] }, problem);
  assert.ok(r.warnings.some((w) => w.includes('条件 1')));
});
test('high-level skill composition equals low-level rectangle fold construction', async () => {
  const skillPlan = {
    ...plan,
    nodes: [],
    segments: plan.segments,
    faces: [plan.faces[0]],
    checks: [plan.checks[3]],
    skills: [
      { skill: 'rectangle', id: 'rect', points: ['A', 'B', 'C', 'D'], width: 2, height: 3 },
      {
        skill: 'edge_point',
        id: 'E',
        label: 'E',
        ends: ['A', 'B'],
        t: { parameter: 't', scale: -1, offset: 1 },
      },
      {
        skill: 'edge_point',
        id: 'F',
        label: 'F',
        ends: ['D', 'C'],
        t: { parameter: 't', scale: 0.5, offset: 0 },
      },
      {
        skill: 'rotate_group',
        id: 'fold',
        axis: ['E', 'F'],
        angle: { parameter: 'theta', scale: 1, offset: 0 },
        outputs: [
          { source: 'A', id: 'Ap', label: 'A′' },
          { source: 'D', id: 'Dp', label: 'D′' },
        ],
      },
    ],
  };
  assert.equal(validateUniversal(skillPlan, problem).samples, 25);
  for (const theta of [0, 0.4, 1.2, Math.PI])
    assert.deepEqual(
      evaluateUniversal(skillPlan, { t: 0.5, theta }).positions,
      evaluateUniversal(plan, { t: 0.5, theta }).positions,
    );
  const broken = structuredClone(skillPlan);
  broken.skills.reverse();
  assert.doesNotThrow(() => validateUniversal(broken, problem));
});
test('prism and pyramid skills generate validated solids and reject zero height', () => {
  const nodes = [
    { id: 'A', label: 'A', type: 'fixed', position: [0, 0, 0] },
    { id: 'B', label: 'B', type: 'fixed', position: [3, 0, 0] },
    { id: 'C', label: 'C', type: 'fixed', position: [0, 4, 0] },
  ];
  const base = {
    title: '三棱柱',
    reason: 'test',
    limitations: [],
    parameters: [],
    nodes,
    segments: [],
    faces: [],
    metrics: [],
    checks: [],
    coverage: [],
  };
  const prism = {
    ...base,
    skills: [
      { skill: 'prism', id: 'pr', base: ['A', 'B', 'C'], top: ['P', 'Q', 'R'], vector: [0, 0, 5] },
    ],
  };
  assert.equal(
    evaluateUniversal(validateUniversal(prism, { ...problem, conditions: [] }).plan, {}).scene.faces
      .length,
    5,
  );
  const pyramid = {
    ...base,
    nodes: [...nodes, { id: 'P', label: 'P', type: 'fixed', position: [1, 1, 5] }],
    skills: [{ skill: 'pyramid', id: 'py', base: ['A', 'B', 'C'], apex: 'P' }],
  };
  assert.equal(
    evaluateUniversal(validateUniversal(pyramid, { ...problem, conditions: [] }).plan, {}).scene
      .faces.length,
    4,
  );
  const bad = structuredClone(prism);
  bad.skills[0].vector = [1, 1, 0];
  assert.throws(() => validateUniversal(bad, { ...problem, conditions: [] }));
});
test('ratio-point skill enforces BE=2DF at the previously failing u=0.05 and reversed edge orientation', () => {
  const p = {
    ...plan,
    nodes: plan.nodes.filter((n) => !['F', 'Ap', 'Dp'].includes(n.id)),
    skills: [
      {
        skill: 'ratio_point',
        id: 'F',
        label: 'F',
        ends: ['D', 'C'],
        reference: ['B', 'E'],
        ratio: 0.5,
      },
      {
        skill: 'rotate_group',
        id: 'fold',
        axis: ['E', 'F'],
        angle: { parameter: 'theta', scale: 1, offset: 0 },
        outputs: [
          { source: 'A', id: 'Ap', label: 'A′' },
          { source: 'D', id: 'Dp', label: 'D′' },
        ],
      },
    ],
    parameters: plan.parameters.map((p) => (p.id === 't' ? { ...p, min: 0.01, max: 0.99 } : p)),
  };
  for (const t of [0.01, 0.05, 0.1, 0.5, 0.99])
    for (const theta of [0.05, 1, Math.PI])
      assert.ok(evaluateUniversal(p, { t, theta }).residual < 1e-9);
  const reversed = structuredClone(p);
  reversed.nodes.find((n) => n.id === 'E').ends = ['B', 'A'];
  assert.ok(evaluateUniversal(reversed, { t: 0.05, theta: 0.05 }).residual < 1e-9);
});
test('prime point labels normalize only to uniquely declared references', async () => {
  const { normalizeSceneIds } = await import('../src/features/geometry/normalize-ids.ts');
  const raw = structuredClone(plan);
  raw.metrics[0].line = ['A′', 'D′'];
  const normalized = normalizeSceneIds(raw);
  assert.deepEqual(normalized.metrics[0].line, ['Ap', 'Dp']);
  assert.equal(normalized.nodes.find((n) => n.id === 'Ap').label, 'A′');
  assert.ok(validateUniversal(normalized, problem));
  raw.metrics[0].line[0] = 'unknown';
  assert.throws(() => validateUniversal(normalizeSceneIds(raw), problem));
});
