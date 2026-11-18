'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { problemSchema, type StudyProblem } from '@/shared/study-contract';
export function VisualizeButton({
  problem,
  hint,
  progress = '',
  question = 0,
  photo,
}: {
  problem: StudyProblem;
  hint: string;
  progress?: string;
  question?: number;
  photo?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  return (
    <>
      <button
        className="btn"
        type="button"
        onClick={() => {
          try {
            const checked = problemSchema.parse(problem);
            const id = crypto.randomUUID();
            sessionStorage.setItem(
              'geometry-transfer:' + id,
              JSON.stringify({ problem: checked, hint, progress, question, photo }),
            );
            router.push('/geometry?task=' + id);
          } catch {
            setError('无法保存当前题目，请允许浏览器会话存储后重试。');
          }
        }}
      >
        AI 可视化 · 前往几何实验室
      </button>
      <p className="field-hint">需要图形帮助理解时再打开，不影响继续文字作答。</p>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
