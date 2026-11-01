'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/features/auth/session';
import { ApiClientError, errorMessage } from './client';

export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({
    data: null,
    loading: true,
    error: '',
  });
  const [attempt, setAttempt] = useState(0);
  const { expire } = useSession();
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    void Promise.resolve()
      .then(() => {
        if (live) setState({ data: null, loading: true, error: '' });
        return loader(controller.signal);
      })
      .then((data) => {
        if (live) setState({ data, loading: false, error: '' });
      })
      .catch((error) => {
        if (!live || (error instanceof Error && error.name === 'AbortError')) return;
        if (error instanceof ApiClientError && error.status === 401) expire();
        setState({ data: null, loading: false, error: errorMessage(error) });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [loader, attempt, expire]);
  return { ...state, retry: useCallback(() => setAttempt((value) => value + 1), []) };
}
