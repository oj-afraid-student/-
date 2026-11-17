'use client';

import { useEffect, useRef, useState } from 'react';
import { errorMessage, request } from '@/shared/api/client';
import { AI_REQUEST_TIMEOUT_MS } from '@/shared/api/timeouts';

async function preparePhoto(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 15 * 1024 * 1024
  )
    throw new Error('请选择 15 MB 以内的 JPG、PNG 或 WebP 照片。');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('浏览器无法处理照片。');
    drawing.fillStyle = '#fff';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.65, 0.45]) {
      const photo = canvas.toDataURL('image/jpeg', quality);
      if (photo.length <= 950000) return photo;
    }
    throw new Error('照片压缩后仍过大，请裁剪至当前小题。');
  } finally {
    bitmap.close();
  }
}

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
