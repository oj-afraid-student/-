import './helpers/server-loader.mjs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { radialLayout, validateStructure, ancestors, questionsForNode } =
  await import('../src/features/knowledge-map/graph-model.ts');
const data = JSON.parse(
  readFileSync(new URL('../public/content/geometry-knowledge-map.json', import.meta.url)),
).data;
test('真实目录39个知识点具有稳定命名空间，E1单元与细分点不冲突', () => {
  validateStructure(data);
  assert.equal(data.nodes.filter((n) => n.kind === 'unit').length, 15);
  assert.equal(data.nodes.filter((n) => n.kind === 'point').length, 39);
  assert.deepEqual(
    ancestors(data.nodes, 'point:E1').map((n) => n.id),
    ['overview', 'extension', 'unit:E1', 'point:E1'],
  );
  assert.equal(radialLayout(data.nodes, 'point:G5-04').children.length, 0);
});
test('题目按实际细分标签去重筛选，包含原题与扩充题，空专题不误配', () => {
  assert.equal(questionsForNode(data, 'overview').length, 86);
  assert.deepEqual(
    questionsForNode(data, 'point:G5-04').map((q) => q.id),
    ['Q58', 'Q59'],
  );
  assert.equal(questionsForNode(data, 'unit:E4').length, 0);
  const cube = questionsForNode(data, 'point:G1-01');
  assert.ok(cube.some((q) => q.id === 'Q01') && cube.some((q) => q.id === 'Q36'));
  assert.ok(questionsForNode(data, 'unit:SG-01').every((q) => q.unitIds.includes('SG-01')));
  assert.equal(questionsForNode(data, 'missing').length, 0);
});
test('原题和扩充题均可练习，Q33保留待核，公开快照不含答案字段', () => {
  assert.ok(data.questions.every((q) => !q.readingOnly));
  assert.deepEqual(
    data.questions.filter((q) => q.needsReview).map((q) => q.id),
    ['Q33'],
  );
  const text = JSON.stringify(data);
  for (const field of [
    'answer',
    'answerText',
    'grading',
    'reference',
    'correctOptionIds',
    'acceptedValues',
    'note',
  ])
    assert.ok(!text.includes('"' + field + '"'));
  assert.ok(!text.includes('展示'));
});
test('1至32个邻居等角排布、间距不重叠，父节点占用独立方位', () => {
  for (let count = 1; count <= 32; count++) {
    const nodes = [
      { id: 'root', label: '总览', parentId: null },
      { id: 'current', label: '当前', parentId: 'root' },
      ...Array.from({ length: count - 1 }, (_, i) => ({
        id: 'child' + i,
        label: '下级' + i,
        parentId: 'current',
      })),
    ];
    const layout = radialLayout(nodes, 'current');
    const points = [...layout.points.entries()]
      .filter(([id]) => id !== 'current')
      .map(([, p]) => p);
    assert.equal(points.length, count);
    assert.ok(Math.abs(points[0].x) < 0.0001 && points[0].y < 0);
    if (count > 1) {
      const distances = points.map((p, i) =>
        Math.hypot(p.x - points[(i + 1) % count].x, p.y - points[(i + 1) % count].y),
      );
      assert.ok(Math.max(...distances) - Math.min(...distances) < 0.0001);
      assert.ok(Math.min(...distances) > 128 + 20);
    }
    for (const p of points)
      assert.ok(Math.abs(p.x) + 64 < layout.extent / 2 && Math.abs(p.y) + 64 < layout.extent / 2);
  }
});
test('脏目录缺父、循环、重复编号和多根被拒绝，空目录仍可渲染空状态', () => {
  const n = (id, parentId) => ({ id, label: id, parentId });
  for (const nodes of [
    [n('a', null), n('a', 'a')],
    [n('a', null), n('b', 'missing')],
    [n('a', null), n('b', 'c'), n('c', 'b')],
    [n('a', null), n('b', null)],
  ])
    assert.throws(() => validateStructure({ nodes, placeholder: false }));
  assert.deepEqual(validateStructure({ nodes: [], placeholder: false }).nodes, []);
  assert.throws(() => radialLayout([], 'missing'));
});

test('公开快照与上游内容一致且全部配图存在', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/build-knowledge-map-content.mjs', '--check'],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
