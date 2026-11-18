'use client';

import { useEffect, useRef, useState } from 'react';
import { errorMessage, request } from '@/shared/api/client';
import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/timeouts';

import { preparePhoto } from '@/shared/prepare-photo';

export function AnswerPhoto({
  practiceId,
  itemId,
  partId,
  onApply,
}: {
  practiceId: string;
  itemId: string;
  partId: string;
  onApply: (text: string) => void;
}) {
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => () => pending.current?.abort(), []);

  async function recognize(file: File) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setText('');
    setError('');
    try {
      const photo = await preparePhoto(file);
      controller.signal.throwIfAborted();
      const result = await request<{ text: string }>(
        '/api/v1',
        '/practices/' + encodeURIComponent(practiceId) + '/hint',
        {
          method: 'POST',
          body: { itemId, partId, photo },
          signal: controller.signal,
          timeoutMs: AI_REQUEST_TIMEOUT_MS,
        },
      );
      if (!controller.signal.aborted) setText(result.text);
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
      <label className="field">
        <span>拍照或上传本小题作答</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void recognize(file);
          }}
        />
      </label>
      <p className="field-hint">照片将发送给模型转录。核对符号和步骤后再填入作答框。</p>
      {busy && <p role="status">正在识别照片…</p>}
      {error && <p role="alert">{error}</p>}
      {text && (
        <div>
          <textarea
            aria-label="照片识别结果"
            value={text}
            maxLength={10000}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              onApply(text);
              setText('');
            }}
          >
            用识别文字替换本小题作答
          </button>
          <button type="button" className="btn" onClick={() => setText('')}>
            取消
          </button>
        </div>
      )}
    </div>
  );
}
