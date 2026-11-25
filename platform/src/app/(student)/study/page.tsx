import { Suspense } from 'react';
import { StudyWorkbench } from '@/features/study/workbench';

export default function StudyPage() {
  return (
    <Suspense>
      <StudyWorkbench />
    </Suspense>
  );
}
