import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, problem } from './universal-fixture.mjs';
const { generateUniversal } = await import('../src/server/ai/universal-generator.ts');
const { readModelPlan, applyModelRepair } = await import('../src/server/ai/scene-protocol.ts');
const { universalSchema } = await import('../src/features/geometry/universal.ts');

test('wire variants preserve exactly the canonical geometry and validate on first attempt', async () => {
  const copy = structuredClone(plan);
  copy.description = '示意模型';
  for (const node of copy.nodes) {
    node.description = '说明';
    if (node.type === 'fixed') {
      node.coordinates = node.position;
      delete node.position;
    }
  }
  assert.deepEqual(readModelPlan({ plan: copy }), plan);
  let calls = 0;
  const result = await generateUniversal(problem, undefined, {
    bypassRecipes: true,
    model: async () => {
      calls++;
      return { plan: copy };
    },
  });
  assert.equal(calls, 1);
  assert.ok(result.samples);
});
test('conflicting coordinates, unknown geometry and unknown envelopes stay invalid', () => {
  for (const patch of [
    { coordinates: [0, 1, 2] },
    { rotationAxis: ['A', 'B'] },
    { description: { axis: ['A', 'B'] } },
  ]) {
    const copy = structuredClone(plan);
    Object.assign(copy.nodes[0], patch);
    assert.equal(universalSchema.safeParse(readModelPlan(copy)).success, false);
  }
  assert.equal(universalSchema.safeParse(readModelPlan({ plan, constraints: [] })).success, false);
});
test('local repair of invalid node fields cannot change neighboring geometry', async () => {
  for (const wholePlan of [true, false]) {
    const copy = structuredClone(plan);
    copy.nodes[1].unknownField = true;
    copy.nodes[2].unknownField = true;
    let calls = 0;
    const result = await generateUniversal(problem, undefined, {
      bypassRecipes: true,
      model: async (system, content) => {
        assert.match(system, /additionalProperties/);
        if (++calls === 1) return copy;
        assert.match(content, /只替换以下位置/);
        if (!wholePlan)
          return {
            repairs: [1, 2].map((index) => ({ section: 'nodes', index, value: plan.nodes[index] })),
          };
        const other = structuredClone(plan);
        other.nodes[0].position = [99, 99, 99];
        return other;
      },
    });
    assert.deepEqual(result.plan.nodes[0], plan.nodes[0]);
    assert.equal(calls, 2);
  }
});
test('reject wrong patch targets, deleted items and replacement of existing IDs', () => {
  const targets = [{ section: 'nodes', index: 0 }];
  for (const patch of [
    { section: 'checks', index: 0, value: {} },
    { section: 'nodes', index: 0, value: null },
    { section: 'nodes', index: 0, value: { id: 'Other' } },
  ]) {
    assert.throws(() => applyModelRepair(plan, targets, { repairs: [patch] }));
  }
});

test('stated dihedral uses the interior half-planes, rejecting the supplementary angle', async () => {
  const { rhombusSphere } = await import('../src/features/geometry/rhombus-sphere.ts');
  const { extractRequiredChecks, enforceRequiredChecks } =
    await import('../src/features/geometry/plan-harness.ts');
  const { validateUniversal } = await import('../src/features/geometry/universal.ts');
  const p = {
    ...problem,
    text: '菱形ABCD边长6，∠BAD=60°，将BCD沿BD翻折，C到P，二面角A-BD-P为120°。求外接球表面积。',
    conditions: ['∠BAD=60°', '二面角A-BD-P为120°'],
  };
  const raw = rhombusSphere(p);
  const required = extractRequiredChecks(p);
  assert.deepEqual(
    required.map((c) => c.type),
    ['angle', 'dihedral'],
  );
  assert.ok(validateUniversal(enforceRequiredChecks(raw, required, p), p).samples);
  assert.throws(
    () => validateUniversal(enforceRequiredChecks(raw, [{ ...required[1], degrees: 60 }], p), p),
    /约束不满足/,
  );
  assert.throws(
    () =>
      validateUniversal(
        enforceRequiredChecks(raw, [{ ...required[1], points: ['B', 'B', 'D', 'P'] }], p),
        p,
      ),
    /退化几何/,
  );
});

test('successful metric patch exposing an independent length error gets a geometry repair', async () => {
  let calls = 0;
  const invalid = structuredClone(plan);
  invalid.metrics[0] = { ...plan.metrics[0], type: 'not_a_metric' };
  invalid.nodes.find((n) => n.id === 'B').position = [3, 0, 0];
  const result = await generateUniversal(problem, undefined, {
    bypassRecipes: true,
    model: async (_system, content) => {
      calls++;
      if (calls === 1) return invalid;
      if (calls === 2)
        return { repairs: [{ section: 'metrics', index: 0, value: plan.metrics[0] }] };
      assert.match(content, /坐标算得距离/);
      return plan;
    },
  });
  assert.equal(calls, 3);
  assert.ok(result.samples);
});
