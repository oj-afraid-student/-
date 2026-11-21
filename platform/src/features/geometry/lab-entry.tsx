'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { photoSchema } from '@/shared/study-contract';
import { UniversalWorkbench } from './universal-workbench';
import Link from 'next/link';
import { z } from 'zod';
import { problemSchema } from '@/shared/study-contract';
import { GeometryWorkbench } from './workbench';
import { MathText } from '@/shared/ui/common';

const transferSchema = z.object({
  problem: problemSchema,
  photo: photoSchema.optional(),
  hint: z.string().max(10000),
  progress: z.string().max(16000),
  question: z.number().int().nonnegative(),
});
export function GeometryLabEntry({ task }: { task?: string }) {
  const [value, setValue] = useState<z.infer<typeof transferSchema> | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!task) return;
    const timer = window.setTimeout(() => {
      try {
        const parsed = transferSchema.parse(
          JSON.parse(sessionStorage.getItem('geometry-transfer:' + task) || 'null'),
        );
        if (parsed.question >= parsed.problem.questions.length) throw new Error();
        setValue(parsed);
      } catch {
        setError('当前题目已失效或无法读取，请返回题目提示处重新点击 AI 可视化。');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [task]);
  if (!task) return <GeometryWorkbench />;
  if (error)
    return (
      <section className="panel">
        <p role="alert">{error}</p>
        <Link className="btn" href="/study">
          返回拍照学题
        </Link>
      </section>
    );
  if (!value) return <p role="status">正在载入当前题目…</p>;
  return (
    <>
      <h1>几何实验室 · 本题可视化</h1>
      <section className="panel">
        <h2>{value.problem.title}</h2>
        {value.photo && (
          <Image
            src={value.photo}
            alt="本题原图，供核对几何关系"
            width={900}
            height={600}
            unoptimized
            style={{ width: '100%', height: 'auto', maxHeight: 400, objectFit: 'contain' }}
          />
        )}
        {value.problem.diagram?.length ? (
          <details>
            <summary>图示关系与识别依据</summary>
            <ul>
              {value.problem.diagram.map((d, i) => (
                <li key={i}>
                  {d.claim} — {d.evidence}（{d.source === 'uncertain' ? '待确认' : '图示识别'}）
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <MathText>{value.problem.text}</MathText>
        <label className="field">
          <span>核对模型所需条件（每行一项，可补充图示条件）</span>
          <textarea
            rows={5}
            value={value.problem.conditions.join('\n')}
            onChange={(e) =>
              setValue({
                ...value,
                problem: {
                  ...value.problem,
                  conditions: e.target.value.split('\n').filter(Boolean),
                },
              })
            }
          />
        </label>
        {value.problem.uncertainties.length > 0 && (
          <>
            <ul>
              {value.problem.uncertainties.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
            <button
              className="btn"
              onClick={() =>
                setValue({ ...value, problem: { ...value.problem, uncertainties: [] } })
              }
            >
              我已核对并补充必要条件
            </button>
          </>
        )}
        <h3>当前分问</h3>
        <MathText>{value.problem.questions[value.question]}</MathText>
        <h3>AI 第一步提示</h3>
        <MathText>{value.hint}</MathText>
      </section>
      <UniversalWorkbench
        key={JSON.stringify(value.problem)}
        photo={value.photo}
        problem={value.problem}
        initialQuestion={value.question}
        initialProgress={value.progress}
      />
      <Link href="/geometry" className="btn">
        查看固定演示
      </Link>
    </>
  );
}
