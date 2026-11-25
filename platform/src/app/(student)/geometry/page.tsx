import { GeometryLabEntry } from '@/features/geometry/lab-entry';
export default async function GeometryPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string | string[]; example?: string }>;
}) {
  const query = await searchParams;
  return (
    <GeometryLabEntry
      key={typeof query.task === 'string' ? query.task : (query.example ?? 'studio')}
      task={typeof query.task === 'string' ? query.task : undefined}
      example={query.example}
    />
  );
}
