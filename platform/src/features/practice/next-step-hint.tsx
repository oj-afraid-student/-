'use client';
import type { PublicQuestion } from '@/shared/contracts';
import { VisualizeButton } from '@/features/geometry/visualize-button';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, request } from '@/shared/api/client';
import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/timeouts';
import { MathText } from '@/shared/ui/common';

export function NextStepHint({
  practiceId,
  itemId,
  partId,
  progress,
  question,
}: {
  practiceId: string;
  itemId: string;
  partId?: string;
  progress?: string;
  question: PublicQuestion;
}) {
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function loadHint() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    setHint('');
    try {
      const result = await request<{ hint: string }>(
        '/api/v1',
        '/practices/' + encodeURIComponent(practiceId) + '/hint',
        {
          method: 'POST',
          body: { itemId, partId, progress },
          signal: controller.signal,
          timeoutMs: AI_REQUEST_TIMEOUT_MS,
        },
      );
      if (!controller.signal.aborted) setHint(result.hint);
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  const parts =
    'parts' in question ? question.parts : 'statements' in question ? question.statements : [];
  const target = parts.find((p) => p.id === partId);
  const visualProblem = {
    title: question.title,
    text: question.stem,
    conditions: question.stem.split(/(?<=[。；])/).filter(Boolean),
    questions: [target?.prompt || '结合题干探索本题'],
    uncertainties: question.figures.length
      ? ['本题含题图：请对照原题核对图示条件，缺失时返回拍照学题补充。']
      : [],
  };
  return (
    <div>
      <button type="button" className="btn" disabled={busy} onClick={loadHint}>
        {busy ? '正在获取提示…' : hint ? '重新获取下一步提示' : '给我一个下一步提示'}
      </button>
      {hint && (
        <>
          <div role="status">
            <MathText>{hint}</MathText>
          </div>
          <VisualizeButton problem={visualProblem} hint={hint} progress={progress} />
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
