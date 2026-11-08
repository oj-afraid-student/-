'use client';

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { CurrentUser } from '@/shared/contracts';
import { ApiClientError, errorMessage } from '@/shared/api/client';
import { createLearningApi, type LearningApi } from '@/shared/api/learning-api';
import { ErrorState, LoadingState } from '@/shared/ui/common';

interface SessionContext {
  api: LearningApi;
  user: CurrentUser | null;
  loading: boolean;
  error: string;
  warning: string;
  developmentFixtures: boolean;
  setUser: (user: CurrentUser | null) => void;
  reload: () => Promise<void>;
  recheck: () => Promise<void>;
  expire: () => void;
}
const Session = createContext<SessionContext | null>(null);

export function SessionProvider({
  children,
  developmentFixtures,
}: {
  children: React.ReactNode;
  developmentFixtures: boolean;
}) {
  const api = useMemo(
    () => createLearningApi(developmentFixtures ? '/api/development' : '/api/v1'),
    [developmentFixtures],
  );
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const epoch = useRef(0);
  const checking = useRef(false);
  const updateUser = useCallback((current: CurrentUser | null) => {
    epoch.current++;
    setUser(current);
    setError('');
    setWarning('');
    setLoading(false);
  }, []);
  const reload = useCallback(async () => {
    const revision = ++epoch.current;
    setLoading(true);
    setError('');
    setWarning('');
    try {
      const current = await api.me();
      if (revision === epoch.current) setUser(current);
    } catch (error) {
      if (revision !== epoch.current) return;
      setUser(null);
      if (!(error instanceof ApiClientError && error.status === 401)) setError(errorMessage(error));
    } finally {
      if (revision === epoch.current) setLoading(false);
    }
  }, [api]);
  const recheck = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    const revision = epoch.current;
    try {
      const current = await api.me();
      if (revision === epoch.current) {
        setUser(current);
        setWarning('');
      }
    } catch (error) {
      if (revision !== epoch.current) return;
      if (error instanceof ApiClientError && error.status === 401) updateUser(null);
      else setWarning('暂时无法确认登录状态，当前输入已保留，请检查连接后重试。');
    } finally {
      checking.current = false;
    }
  }, [api, updateUser]);
  useEffect(() => {
    const controller = new AbortController();
    const revision = ++epoch.current;
    void api
      .me(controller.signal)
      .then((current) => {
        if (!controller.signal.aborted && revision === epoch.current) setUser(current);
      })
      .catch((error) => {
        if (controller.signal.aborted || revision !== epoch.current) return;
        setUser(null);
        if (!(error instanceof ApiClientError && error.status === 401))
          setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted && revision === epoch.current) setLoading(false);
      });
    return () => controller.abort();
  }, [api]);
  useEffect(() => {
    if (!user) return;
    const focus = () => {
      if (document.visibilityState === 'visible') void recheck();
    };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [user, recheck]);
  const expire = useCallback(() => updateUser(null), [updateUser]);
  return (
    <Session.Provider
      value={{
        api,
        user,
        loading,
        error,
        warning,
        developmentFixtures,
        setUser: updateUser,
        reload,
        recheck,
        expire,
      }}
    >
      {children}
    </Session.Provider>
  );
}
export function useSession() {
  const session = useContext(Session);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
export function RequireUser({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!session.loading && !session.error && !session.user)
      router.replace('/login?returnTo=' + encodeURIComponent(pathname + window.location.search));
  }, [session.loading, session.error, session.user, router, pathname]);
  if (session.loading) return <LoadingState text="正在确认登录状态…" />;
  if (session.error)
    return <ErrorState message={session.error} retry={() => void session.reload()} />;
  if (!session.user) return <LoadingState text="正在前往登录…" />;
  return <Fragment key={session.user.id}>{children}</Fragment>;
}
