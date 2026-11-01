import { PracticeBuilder } from '@/features/practice/practice-builder';
export default async function NewPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const { unit } = await searchParams;
  return <PracticeBuilder initialUnit={unit ?? ''} />;
}
