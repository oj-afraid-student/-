import 'server-only';
import { listKnowledgeUnits } from '@/server/catalog/service';
import directory from './geometry-directory.json' with { type: 'json' };

export async function candidateScopes() {
  const published = await listKnowledgeUnits();
  const releasedIds = new Set(published.flatMap((unit) => unit.knowledgeIds));
  const units = directory.map((unit) => ({
    ...unit,
    points: unit.points.map((point) => ({ ...point, preview: !releasedIds.has(point.id) })),
  }));
  for (const unit of published) {
    const entry = units.find((item) => item.id === unit.id);
    const extra = unit.knowledgeIds
      .filter((id) => !directory.some((group) => group.points.some((point) => point.id === id)))
      .map((id) => ({ id, title: id, preview: false }));
    if (entry) entry.points.push(...extra);
    else units.push({ id: unit.id, title: unit.title, points: extra });
  }
  return units;
}
