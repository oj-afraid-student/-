import 'server-only';
import type { PoolClient } from 'pg';
import type { PublicQuestion } from '@/shared/contracts';
import type { PracticeCatalogPort, StoredQuestionVersion } from './contracts';

/** Explicit projection: never spread a database document into an HTTP question. */
export function publicQuestion(q: PublicQuestion): PublicQuestion {
  const base = {
    id: q.id,
    version: q.version,
    title: q.title,
    stem: q.stem,
    difficulty: q.difficulty,
    knowledgeIds: q.knowledgeIds,
    unitIds: q.unitIds,
    figures: q.figures.map(({ id, src, alt, caption }) => ({ id, src, alt, caption })),
    sourceLabel: q.sourceLabel,
  };
  if ('options' in q)
    return { ...base, type: q.type, options: q.options.map(({ id, text }) => ({ id, text })) };
  if (q.type === 'FILL_BLANK')
    return {
      ...base,
      type: q.type,
      blanks: q.blanks.map(({ id, label, valueCount, unordered, unit }) => ({
        id,
        label,
        valueCount,
        unordered,
        unit,
      })),
    };
  if (q.type === 'JUDGMENT_REASON')
    return {
      ...base,
      type: q.type,
      statements: q.statements.map(({ id, prompt }) => ({ id, prompt })),
    };
  return { ...base, type: q.type, parts: q.parts.map(({ id, prompt }) => ({ id, prompt })) };
}
const columns = `id AS "versionId", public_question AS question,
  reference_answer AS reference, grading, source,
  CASE WHEN is_published THEN 'PUBLISHED' ELSE 'DRAFT' END AS "publicationStatus"`;

/** Minimal SQL adapter for the frozen port; does not import or publish content. */
export function practiceCatalog(client: PoolClient): PracticeCatalogPort {
  return {
    async listPublished() {
      const { rows } = await client.query<StoredQuestionVersion>(
        `SELECT DISTINCT ON (question_key) ${columns}
         FROM question_version WHERE is_published ORDER BY question_key, version DESC`,
      );
      return rows;
    },
    async loadQuestionVersions(versionIds) {
      const { rows } = await client.query<StoredQuestionVersion>(
        `SELECT ${columns} FROM question_version WHERE id = ANY($1::uuid[])`,
        [versionIds],
      );
      const byId = new Map(rows.map((row) => [row.versionId, row]));
      return versionIds.map((id) => {
        const record = byId.get(id);
        if (!record) throw new Error('Referenced question version is missing');
        return record;
      });
    },
  };
}
