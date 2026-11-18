import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { mergeDiagramReview } = await import('../src/server/ai/diagram-review.ts');
const p = {
  title: '折叠',
  text: '原始题干',
  conditions: ['BE=2DF'],
  questions: ['求距离'],
  uncertainties: ['E在哪条边', '折叠方向不明'],
};
test('diagram additions preserve original, append conditions and clear only supported uncertainty', () => {
  const r = mergeDiagramReview(p, {
    additions: [
      {
        kind: 'geometric',
        text: 'E在AB上',
        evidence: '图中E位于标注A和B之间的边线上',
        source: 'incidence',
        resolves: [0],
      },
    ],
    questions: [],
  });
  assert.equal(r.text, p.text);
  assert.deepEqual(r.conditions, ['BE=2DF', 'E在AB上']);
  assert.deepEqual(r.uncertainties, ['折叠方向不明']);
  assert.equal(r.supplements.length, 1);
});
test('empty evidence and nonexistent resolved indices are rejected', () => {
  for (const addition of [
    { kind: 'geometric', text: 'E在AB上', evidence: '', source: 'label', resolves: [0] },
    { kind: 'geometric', text: 'E在AB上', evidence: '标记', source: 'label', resolves: [5] },
  ])
    assert.throws(() => mergeDiagramReview(p, { additions: [addition], questions: [] }));
});
test('screen projection observations never become mathematical conditions or resolve ambiguity', () => {
  const r = mergeDiagramReview(p, {
    additions: [
      {
        kind: 'diagram_view',
        text: 'A′看似位于BC上',
        evidence: '投影视图',
        source: 'incidence',
        resolves: [0],
      },
    ],
    questions: [],
  });
  assert.deepEqual(r.conditions, p.conditions);
  assert.deepEqual(r.uncertainties, p.uncertainties);
  assert.equal(r.supplements.length, 0);
  assert.equal(r.diagram[0].source, 'uncertain');
});
