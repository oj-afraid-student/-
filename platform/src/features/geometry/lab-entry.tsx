'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { photoSchema, problemSchema } from '@/shared/study-contract';
import { LabStudio } from './lab-studio';
const transferSchema = z.object({
  problem: problemSchema,
  photo: photoSchema.optional(),
  hint: z.string().max(10000),
  progress: z.string().max(16000),
  question: z.number().int().nonnegative(),
});
export function GeometryLabEntry({ task, example }: { task?: string; example?: string }) {
  const [value, setValue] = useState<z.infer<typeof transferSchema> | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!task) return;
    const timer = setTimeout(() => {
      try {
        const p = transferSchema.parse(
          JSON.parse(sessionStorage.getItem('geometry-transfer:' + task) || 'null'),
        );
        setValue(p);
      } catch {
        setError('当前题目已失效，请返回拍照学题重新进入实验室。');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [task]);
  if (!task) return <LabStudio example={example} />;
  if (error)
    return (
      <div className="panel">
        <p role="alert">{error}</p>
        <Link href="/study">返回拍照学题</Link>
      </div>
    );
  if (!value) return <p role="status">正在载入当前题目…</p>;
  return <LabStudio initialProblem={value.problem} initialPhoto={value.photo} />;
}
