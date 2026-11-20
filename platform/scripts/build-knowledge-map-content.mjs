import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { readContentRelease } from './lib/content.mjs';
const root = new URL('../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const handoff = read('../docs/content-expansion/立体几何扩充_标注数据.json');
const old = read('fixtures/content/questions.json');
const published = new Map(readContentRelease().bank.map(({ question }) => [question.id, question]));
const nodes = [
  {
    id: 'overview',
    label: '立体几何',
    parentId: null,
    kind: 'overview',
    summary: '从知识单元进入具体考点，结合题目理解空间关系。',
  },
  {
    id: 'core',
    label: '核心单元',
    parentId: 'overview',
    kind: 'group',
    summary: '学习空间关系、几何体与专题方法。',
  },
  {
    id: 'extension',
    label: '拓展单元',
    parentId: 'overview',
    kind: 'group',
    summary: '连接空间角、向量与翻折等综合方法。',
  },
];
const known = new Set();
const unitByPoint = new Map();
for (const unit of [...handoff.directory].sort((a, b) => a.order - b.order)) {
  assert.deepEqual(
    unit.sections.map((s) => s.id),
    unit.knowledgeIds,
    unit.id + ' sections',
  );
  nodes.push({
    id: 'unit:' + unit.id,
    label: unit.title,
    code: unit.id,
    parentId: unit.extension ? 'extension' : 'core',
    kind: 'unit',
    summary: unit.summary,
    figures: unit.figures,
    knowledgeIds: unit.knowledgeIds,
  });
  for (const section of unit.sections) {
    assert.ok(!known.has(section.id), '重复知识编号 ' + section.id);
    known.add(section.id);
    unitByPoint.set(section.id, unit.id);
    nodes.push({
      id: 'point:' + section.id,
      label: section.title,
      code: section.id,
      parentId: 'unit:' + unit.id,
      kind: 'point',
      paragraphs: section.paragraphs,
      figures: unit.figures,
      knowledgeIds: [section.id],
    });
  }
}
// Allowlist only public reading fields. Annotation answers/notes never enter this file.
const publicQuestion = (q, needsReview = false) => ({
  id: q.id,
  version: q.version,
  title: q.title,
  stem: q.stem,
  knowledgeIds: q.knowledgeIds,
  unitIds: q.unitIds,
  figures: q.figures.map((f) => ({ id: f.id, src: f.src, alt: f.alt, caption: f.caption })),
  ...(q.options ? { options: q.options.map((o) => ({ id: o.id, text: o.text })) } : {}),
  ...((q.parts ?? q.statements)
    ? { prompts: (q.parts ?? q.statements).map((p) => ({ id: p.id, prompt: p.prompt })) }
    : {}),
  readingOnly: !published.has(q.id),
  needsReview,
});
const questions = [
  ...old.map((q) => publicQuestion(q)),
  ...handoff.questions.map((entry) =>
    publicQuestion(entry.question, entry.answerStatus === 'needs_review'),
  ),
];
assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
assert.equal(questions.length, 86);
for (const q of questions) {
  assert.ok(q.stem && q.title && q.knowledgeIds.length, q.id);
  const released = published.get(q.id);
  if (released) {
    assert.equal(q.version, released.version, q.id + ' released version');
    assert.deepEqual(q.knowledgeIds, released.knowledgeIds, q.id + ' released knowledge tags');
    assert.deepEqual(q.unitIds, released.unitIds, q.id + ' released unit tags');
  }
  for (const id of q.knowledgeIds) assert.ok(known.has(id), q.id + ' unknown ' + id);
  assert.deepEqual(
    new Set(q.unitIds),
    new Set(q.knowledgeIds.map((id) => unitByPoint.get(id))),
    q.id + ' unit tags',
  );
}
for (const figure of [
  ...nodes.flatMap((n) => n.figures ?? []),
  ...questions.flatMap((q) => q.figures),
]) {
  assert.match(figure.src, /^\/geometry\/[a-z0-9-]+\.png$/);
  assert.ok(existsSync(new URL('public' + figure.src, root)), '缺图 ' + figure.src);
}
const envelope = { data: { nodes, placeholder: false, questions }, error: null };
const output = JSON.stringify(envelope, null, 2) + '\n';
assert.ok(!output.includes('展示'));
for (const token of [
  'answerText',
  'correctOptionIds',
  'acceptedValues',
  'answerStatus',
  'reference',
  'grading',
  'note',
])
  assert.ok(!output.includes('"' + token + '"'), token);
const target = new URL('public/content/geometry-knowledge-map.json', root);
if (process.argv.includes('--check')) {
  assert.deepEqual(
    JSON.parse(readFileSync(target, 'utf8')),
    envelope,
    '知识图谱快照与源内容不同，请重新生成',
  );
  console.log('PASS 知识图谱公开快照与源数据一致：15 单元 / 39 知识点 / 86 题');
} else {
  mkdirSync(new URL('public/content/', root), { recursive: true });
  writeFileSync(target, output);
  console.log('已生成知识图谱公开内容（不含答案或判题字段）');
}
