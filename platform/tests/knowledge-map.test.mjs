import './helpers/server-loader.mjs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readContentRelease } from '../scripts/lib/content.mjs';
const {
  radialLayout,
  backgroundLayout,
  validateStructure,
  ancestors,
  questionsForNode,
  withPublishedQuestions,
  graphFocus,
  uploadTopicPaths,
} = await import('../src/features/knowledge-map/graph-model.ts');
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
test('背景坐标覆盖所有节点且按层级由内向外分布', () => {
  const layout = backgroundLayout(data.nodes);
  assert.equal(layout.size, data.nodes.length);
  assert.deepEqual(layout.get('overview'), { x: 0, y: 0 });
  assert.deepEqual(layout, backgroundLayout(data.nodes));
  assert.equal(backgroundLayout([]).size, 0);
  const radius = (id) => Math.hypot(layout.get(id).x, layout.get(id).y);
  for (const { id, parentId } of data.nodes) {
    if (parentId) assert.ok(radius(id) > radius(parentId), id);
  }
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
test('公开目录保留Q33阅读标记，公开快照不含答案字段', () => {
  assert.deepEqual(
    data.questions.filter((q) => q.readingOnly).map((q) => q.id),
    ['Q33'],
  );
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
test('正式85题均有图谱入口，单元题目与发布清单一致', () => {
  const { units, bank } = readContentRelease();
  const official = bank.map((record) => record.question);
  assert.equal(official.length, 85);
  assert.ok(official.every((question) => question.id !== 'Q33'));
  const live = withPublishedQuestions(data, official);
  const root = questionsForNode(live, 'overview');
  assert.deepEqual(
    root.map((q) => q.id),
    official.map((q) => q.id),
  );
  for (const unit of units) {
    assert.deepEqual(
      questionsForNode(live, 'unit:' + unit.id).map((q) => q.id),
      unit.questionIds,
    );
  }
  for (const q of root) {
    const focus = graphFocus(live, null, q.id);
    assert.equal(focus.kind, 'point', q.id);
    assert.ok(
      questionsForNode(live, focus.id).some((entry) => entry.id === q.id),
      q.id,
    );
  }
});

test('图谱以服务端发布结果为准，弃用静态题稿并接收同标签的新题和换版', () => {
  const original = data.questions.find((q) => q.id === 'Q33');
  const latest = { ...original, version: 2, stem: '新版题干' };
  const newQuestion = { ...latest, id: 'Q1000' };
  const live = withPublishedQuestions(data, [latest, newQuestion]);
  assert.deepEqual(
    live.questions.map(({ id, version, stem, needsReview }) => ({
      id,
      version,
      stem,
      needsReview,
    })),
    [
      { id: 'Q33', version: 2, stem: '新版题干', needsReview: false },
      { id: 'Q1000', version: 2, stem: '新版题干', needsReview: false },
    ],
  );
  assert.deepEqual(
    questionsForNode(live, 'point:G8-01').map((q) => q.id),
    ['Q33', 'Q1000'],
  );
  assert.equal(graphFocus(live, null, 'Q01').id, 'overview');
});

test('上传题定位保留不同分支的叶子和全部祖先，去重且忽略无效或单元标签', () => {
  const codes = ['G1-01', 'E1', 'G1-01', 'SG-01', 'missing'];
  const paths = uploadTopicPaths(data.nodes, codes);
  assert.deepEqual(paths.leafIds, new Set(['point:G1-01', 'point:E1']));
  assert.deepEqual(
    paths.nodeIds,
    new Set(['overview', 'core', 'unit:SG-01', 'point:G1-01', 'extension', 'unit:E1', 'point:E1']),
  );
  assert.equal(paths.nodes.filter(({ id }) => id === 'overview').length, 1);
  assert.equal(paths.partial, true);
  assert.equal(uploadTopicPaths(data.nodes, ['E1', 'G1-01']).partial, false);
  assert.deepEqual(uploadTopicPaths(data.nodes, ['missing']).nodes, []);
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
