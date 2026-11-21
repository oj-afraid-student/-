import { UniversalWorkbench } from '@/features/geometry/universal-workbench';
import { foldProblems } from '@/features/geometry/verified-folds';
import { GeometryLabEntry } from '@/features/geometry/lab-entry';
export default async function GeometryPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string | string[]; example?: string }>;
}) {
  const query = await searchParams;
  if (query.example === 'trajectory' || query.example === 'ratio')
    return (
      <>
        <h1>几何实验室 · 两道折叠题</h1>
        <p>{foldProblems[query.example].text}</p>
        <UniversalWorkbench problem={foldProblems[query.example]} />
      </>
    );
  return (
    <GeometryLabEntry
      key={typeof query.task === 'string' ? query.task : 'demo'}
      task={typeof query.task === 'string' ? query.task : undefined}
    />
  );
}
