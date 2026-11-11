import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);

export function readContentRelease() {
  const release = JSON.parse(readFileSync(new URL('db/content-release.json', root), 'utf8'));
  function readReviewedFile(path) {
    const data = readFileSync(new URL(path, root));
    const hash = createHash('sha256').update(data).digest('hex');
    if (hash !== release.files[path]) {
      throw new Error('内容与发布清单不符，请复核文件 ' + path);
    }
    return data;
  }

  const units = JSON.parse(readReviewedFile('fixtures/content/knowledge-units.json'));
  const bank = JSON.parse(readReviewedFile('fixtures/server/question-bank.json'));
  const figures = new Set(
    [
      ...units.flatMap((unit) => unit.figures),
      ...bank.flatMap(({ question }) => question.figures),
    ].map(({ src }) => src),
  );
  for (const src of figures) {
    if (!/^\/geometry\/[a-z0-9][a-z0-9._-]*\.[a-z0-9]+$/i.test(src)) {
      throw new Error('配图地址无效：' + src);
    }
    readReviewedFile('public' + src);
  }
  return { units, bank };
}

const sameIds = (left, right) =>
  left.length === right.length &&
  new Set(left).size === left.length &&
  left.every((id) => right.includes(id));

function validateRelationships({ units, bank }) {
  const unitIds = units.map(({ id }) => id);
  const questionIds = bank.map(({ question }) => question.id);
  if (!unitIds.length || new Set(unitIds).size !== unitIds.length) {
    throw new Error('知识单元为空或编号重复。');
  }
  if (!questionIds.length || new Set(questionIds).size !== questionIds.length) {
    throw new Error('题库为空或题号重复。每份发布内容应为每道题指定一个版本。');
  }

  const sectionUnits = new Map();
  for (const unit of units) {
    if (
      !unit.sections.length ||
      !sameIds(
        unit.knowledgeIds,
        unit.sections.map(({ id }) => id),
      )
    ) {
      throw new Error('单元与细分知识点不一致：' + unit.id);
    }
    for (const id of unit.knowledgeIds) {
      if (sectionUnits.has(id)) throw new Error('细分知识点编号重复：' + id);
      sectionUnits.set(id, unit.id);
    }
  }

  for (const { question } of bank) {
    const relatedUnits = [...new Set(question.knowledgeIds.map((id) => sectionUnits.get(id)))];
    if (
      !relatedUnits.length ||
      relatedUnits.includes(undefined) ||
      !sameIds(question.unitIds, relatedUnits)
    ) {
      throw new Error('题目与所属单元、知识点不一致：' + question.id);
    }
  }
  for (const unit of units) {
    const related = bank
      .filter(({ question }) => question.unitIds.includes(unit.id))
      .map(({ question }) => question.id);
    if (!sameIds(unit.questionIds, related)) {
      throw new Error('单元目录与题库关联不一致：' + unit.id);
    }
  }
}

export async function importContent(client, release) {
  validateRelationships(release);
  const { units, bank } = release;
  await client.query('BEGIN');
  try {
    // Serialize releases, including repeat imports against the same versions.
    await client.query('LOCK TABLE knowledge_point, question_version IN SHARE ROW EXCLUSIVE MODE');
    for (const unit of units) {
      const { id, title, summary, order, extension, knowledgeIds, sections, figures } = unit;
      await client.query(
        'INSERT INTO knowledge_point (id, title, summary, sort_order, content) ' +
          'VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET ' +
          'title = EXCLUDED.title, summary = EXCLUDED.summary, ' +
          'sort_order = EXCLUDED.sort_order, content = EXCLUDED.content',
        [id, title, summary, order, { extension, knowledgeIds, sections, figures }],
      );
    }

    for (const { question, reference, grading, source } of bank) {
      const values = [question.id, question.version, question, reference, grading, source];
      const { rows } = await client.query(
        'INSERT INTO question_version ' +
          '(question_key, version, public_question, reference_answer, grading, source, is_published) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, true) ' +
          'ON CONFLICT (question_key, version) DO UPDATE SET is_published = true ' +
          'WHERE question_version.public_question = EXCLUDED.public_question ' +
          'AND question_version.reference_answer = EXCLUDED.reference_answer ' +
          'AND question_version.grading = EXCLUDED.grading ' +
          'AND question_version.source IS NOT DISTINCT FROM EXCLUDED.source ' +
          'RETURNING id',
        values,
      );
      if (!rows.length) {
        throw new Error(
          '题目 ' + question.id + ' v' + question.version + ' 已有不同内容，请新增版本。',
        );
      }
    }
    await client.query('COMMIT');
    return { units: units.length, questions: bank.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
