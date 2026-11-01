import { PracticeView } from '@/features/practice/practice-view';
export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PracticeView id={id} />;
}
