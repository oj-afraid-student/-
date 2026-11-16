import './helpers/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { radialLayout, validateStructure, ancestors } =
  await import('../src/features/knowledge-map/graph-model.ts');
const { placeholderStructure } = await import('../src/features/knowledge-map/structure.ts');
test('图谱占位目录编号稳定、父链完整，可从叶子回到最高层', () => {
  const data = validateStructure(placeholderStructure);
  const leaf = data.nodes.find((n) => n.id === 'topic-A-1-0');
  assert.deepEqual(
    ancestors(data.nodes, leaf.id).map((n) => n.id),
    ['overview', 'topic-A', 'topic-A-1', leaf.id],
  );
  assert.equal(radialLayout(data.nodes, leaf.id).children.length, 0);
  assert.equal(radialLayout(data.nodes, leaf.id).parent.id, 'topic-A-1');
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
