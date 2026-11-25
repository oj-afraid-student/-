import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, problem } from './universal-fixture.mjs';
const { extractRequiredChecks, enforceRequiredChecks } =
  await import('../src/features/geometry/plan-harness.ts');
const { validateUniversal, evaluateUniversal } =
  await import('../src/features/geometry/universal.ts');
const { generateUniversal } = await import('../src/server/ai/universal-generator.ts');
const { verifiedFold, foldProblems } = await import('../src/features/geometry/verified-folds.ts');
test('extract only explicit numerical equalities, not questions or expressions', () => {
  const checks = extractRequiredChecks({
    ...problem,
    conditions: ['AB=2，AD=3', 'BE=2DF', 'AC=2+3', 'AB=20x', 'AB>2', '求AB=8是否成立'],
    questions: ['AB=99'],
  });
  assert.equal(checks.length, 3);
  assert.equal(checks[2].type, 'length_multiple');
});
test('independent conditions reject wrong dimensions even without model checks', () => {
  const bad = structuredClone(plan);
  bad.checks = [];
  bad.nodes.find((n) => n.id === 'B').position = [4, 0, 0];
  assert.throws(() =>
    validateUniversal(enforceRequiredChecks(bad, extractRequiredChecks(problem)), problem),
  );
});
test('forward references are sorted without changing geometry', () => {
  const reversed = structuredClone(plan);
  reversed.nodes.reverse();
  assert.deepEqual(
    evaluateUniversal(reversed, {}).positions,
    evaluateUniversal(plan, {}).positions,
  );
  const skills = verifiedFold('trajectory');
  skills.skills.reverse();
  assert.doesNotThrow(() => validateUniversal(skills, foldProblems.trajectory));
});
test('cyclic dependencies remain rejected', () => {
  const bad = structuredClone(plan);
  bad.nodes.push(
    { id: 'X', label: 'X', type: 'translate', source: 'Y', vector: [0, 0, 1] },
    { id: 'Y', label: 'Y', type: 'translate', source: 'X', vector: [0, 0, 1] },
  );
  assert.throws(() => evaluateUniversal(bad, {}), /循环/);
});
test('repair retains independent constraints and gives model failure feedback', async () => {
  let calls = 0;
  const bad = structuredClone(plan);
  bad.checks = [];
  bad.nodes.find((n) => n.id === 'B').position = [4, 0, 0];
  const result = await generateUniversal(problem, undefined, {
    bypassRecipes: true,
    model: async (_system, content) => {
      calls++;
      if (calls === 2) {
        assert.match(content, /上次方案未通过/);
        assert.match(content, /独立题设检查/);
      }
      return calls === 1 ? bad : plan;
    },
  });
  assert.equal(calls, 2);
  assert.ok(result.samples > 0);
});
test('duplicate point IDs cannot disappear during dependency sorting', () => {
  const bad = structuredClone(plan);
  bad.nodes.push({ ...bad.nodes[0], type: 'translate', source: 'E', vector: [0, 0, 0] });
  assert.throws(() => evaluateUniversal(bad, {}), /重复/);
});
test('description labels do not change shape geometry', () => {
  const p = verifiedFold('trajectory');
  p.skills[0].label = '矩形';
  assert.doesNotThrow(() => validateUniversal(p, foldProblems.trajectory));
});
test('motion endpoint verification rejects a plausible but wrong angle limit', async () => {
  const { verifyMotionEndpoints } = await import('../src/features/geometry/plan-harness.ts');
  const p = verifiedFold('trajectory');
  assert.doesNotThrow(() => verifyMotionEndpoints(p, foldProblems.trajectory));
  p.parameters[0].max = 2.034444;
  assert.throws(() => verifyMotionEndpoints(p, foldProblems.trajectory), /运动端点/);
});
test('check pair aliases resolve to the same declared midpoint as metrics', async () => {
  const { normalizeSceneIds } = await import('../src/features/geometry/normalize-ids.ts');
  const p = verifiedFold('trajectory');
  p.skills.find((s) => s.id === 'G').id = 'middle';
  const normalized = normalizeSceneIds(p);
  assert.equal(normalized.checks[2].first[1], 'middle');
  assert.equal(normalized.checks[2].second[0], 'middle');
  assert.doesNotThrow(() => validateUniversal(normalized, foldProblems.trajectory));
});
test('presentation defaults and exact quote indices are repaired without changing geometry', () => {
  const p = structuredClone(plan);
  delete p.faces[0].color;
  p.coverage[0].index = 20;
  const corrected = enforceRequiredChecks(p, extractRequiredChecks(problem), problem);
  assert.equal(corrected.faces[0].color, '#72a69a');
  assert.equal(corrected.coverage[0].index, 0);
  assert.deepEqual(corrected.nodes, p.nodes);
  assert.doesNotThrow(() => validateUniversal(corrected, problem));
});
