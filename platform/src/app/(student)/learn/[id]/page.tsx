import { KnowledgeView } from '@/features/learning/learning-view';
export default async function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnowledgeView id={id} />;
}
