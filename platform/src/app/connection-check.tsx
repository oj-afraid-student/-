'use client';

import { useState } from 'react';
import type { ApiResponse, HealthStatus } from '@/shared/contracts';

export function ConnectionCheck() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('点击检查本地页面与接口是否连通。');

  async function check() {
    setPending(true);
    try {
      const response = await fetch('/api/v1/health', { cache: 'no-store' });
      const result = (await response.json()) as ApiResponse<HealthStatus>;
      if (!response.ok || result.error || !result.data || result.data.status !== 'ok') {
        throw new Error('unavailable');
      }
      setMessage('页面与接口连接正常。');
    } catch {
      setMessage('暂时无法连接，请确认本地服务正在运行后重试。');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={check}
        disabled={pending}
        className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? '正在检查…' : '检查服务连接'}
      </button>
      <p role="status" aria-live="polite" className="mt-3 text-sm leading-6 text-slate-600">
        {message}
      </p>
    </div>
  );
}
