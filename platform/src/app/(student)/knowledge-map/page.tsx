import { KnowledgeMap } from '@/features/knowledge-map/knowledge-map';
import '@/features/knowledge-map/knowledge-map.css';
export default async function KnowledgeMapPage({
  searchParams,
}: {
  searchParams: Promise<{ node?: string; question?: string }>;
}) {
  const { node, question } = await searchParams;
  const query = new URLSearchParams();
  if (typeof node === 'string') query.set('node', node);
  if (typeof question === 'string') query.set('question', question);
  return <KnowledgeMap initialQuery={query.size ? '?' + query.toString() : ''} />;
}
