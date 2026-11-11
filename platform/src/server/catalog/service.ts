import 'server-only';
import type { KnowledgeDetail, KnowledgeSummary } from '@/shared/contracts';
import { withTransaction } from '@/server/db';
import { ApiError } from '@/server/http';
import { practiceCatalog } from '@/server/practice/catalog';

type UnitRow = Pick<KnowledgeSummary, 'id' | 'title' | 'summary' | 'order'> & {
  content: Pick<KnowledgeDetail, 'extension' | 'knowledgeIds' | 'sections' | 'figures'>;
};

async function readUnits(id?: string): Promise<KnowledgeDetail[]> {
  return withTransaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows } = await client.query<UnitRow>(
      'SELECT id, title, summary, sort_order AS "order", content FROM knowledge_point ' +
        "WHERE content ? 'sections' AND ($1::text IS NULL OR id = $1) ORDER BY sort_order, id",
      [id ?? null],
    );
    if (!rows.length) return [];

    const questionsByUnit = new Map<string, string[]>();
    for (const { question } of await practiceCatalog(client).listPublished()) {
      for (const unitId of new Set(question.unitIds)) {
        const ids = questionsByUnit.get(unitId) ?? [];
        ids.push(question.id);
        questionsByUnit.set(unitId, ids);
      }
    }

    return rows.map(({ content, ...unit }) => ({
      ...unit,
      extension: content.extension,
      knowledgeIds: content.knowledgeIds,
      questionIds: questionsByUnit.get(unit.id) ?? [],
      sections: content.sections,
      figures: content.figures,
    }));
  });
}

export async function listKnowledgeUnits(): Promise<KnowledgeSummary[]> {
  return (await readUnits()).map(
    ({ sections: _sections, figures: _figures, ...summary }) => summary,
  );
}

export async function getKnowledgeUnit(id: string): Promise<KnowledgeDetail> {
  const [unit] = await readUnits(id);
  if (!unit) throw new ApiError('NOT_FOUND', 404, '没有找到这个知识单元。');
  return unit;
}
