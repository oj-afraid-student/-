import { KnowledgeMap } from '@/features/knowledge-map/knowledge-map';
import '@/features/knowledge-map/knowledge-map.css';
export default async function KnowledgeMapPage({
  searchParams,
}: {
  searchParams: Promise<{ node?: string }>;
}) {
  const { node } = await searchParams;
  return <KnowledgeMap initialId={typeof node === 'string' ? node : undefined} />;
}
