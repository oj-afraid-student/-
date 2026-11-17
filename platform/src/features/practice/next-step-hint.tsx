'use client';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, request } from '@/shared/api/client';
import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/timeouts';

export function NextStepHint({
  practiceId,
  itemId,
  partId,
  progress,
}: {
  practiceId: string;
  itemId: string;
  partId?: string;
  progress?: string;
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
  return (
    <div>
      <button type="button" className="btn" disabled={busy} onClick={loadHint}>
        {busy ? '正在获取提示…' : hint ? '重新获取下一步提示' : '给我一个下一步提示'}
      </button>
      {hint && <p role="status">{hint}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
