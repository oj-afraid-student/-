'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/features/auth/session';
import { errorMessage } from '@/shared/api/client';
import { Icon } from './icons';

const navigation = [
  { href: '/learn', text: '知识学习', icon: 'book', hint: '概念 · 条件 · 例题' },
  { href: '/practice/new', text: '自主练习', icon: 'pen', hint: '选择题组，逐步推理' },
  { href: '/history', text: '练习记录', icon: 'history', hint: '回顾每一次思考' },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, api, setUser, developmentFixtures, warning, recheck } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const authPage = pathname === '/login' || pathname === '/register';
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api.logout();
      if (user) {
        try {
          for (const key of Object.keys(localStorage))
            if (key.startsWith(`zhixu:draft:v2:${user.id}:`)) localStorage.removeItem(key);
        } catch {
          /* Cookie logout already succeeded. */
        }
      }
      setUser(null);
      router.replace('/login');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (authPage)
    return (
      <>
        {developmentFixtures && (
          <div className="development-banner" role="status">
            开发样例环境 · 数据仅用于本地开发，重启后重置
          </div>
        )}
        {children}
      </>
    );
  const current = pathname.startsWith('/practice')
    ? navigation[1]
    : pathname.startsWith('/results') || pathname.startsWith('/history')
      ? navigation[2]
      : navigation[0];
  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      {open && (
        <button className="nav-scrim" aria-label="关闭导航" onClick={() => setOpen(false)} />
      )}
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <Link className="brand" href="/learn" onClick={() => setOpen(false)}>
          <span className="brandmark">知</span>
          <span>
            <strong>知序</strong>
            <small>让抽象，变得可理解</small>
          </span>
        </Link>
        <p className="nav-label">我的学习空间</p>
        <nav aria-label="主要导航">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`nav-item ${current === item ? 'active' : ''}`}
              aria-current={current === item ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>
                {item.text}
                <small>{item.hint}</small>
              </span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="diamond" />
            <p>
              从条件出发，
              <br />
              让每一步推理都有依据。
            </p>
          </div>
          <div className="user-card">
            <span className="avatar">{user?.username.slice(0, 1).toUpperCase() ?? '同'}</span>
            <span>
              <strong>{user?.username ?? '学习者'}</strong>
              <small>高中数学 · 学生</small>
            </span>
            <button
              className="icon-button"
              aria-label="退出登录"
              title="退出登录"
              disabled={busy}
              onClick={() => void logout()}
            >
              <Icon name="exit" />
            </button>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <div className="row">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <Icon name="menu" />
            </button>
            <span className="breadcrumbs">
              学习空间 <span>/</span> <b>{current.text}</b>
            </span>
          </div>
          <div className="row">
            <span className="subject-label">数学 · 立体几何</span>
            <span className="tag green">学生端</span>
          </div>
        </header>
        {developmentFixtures && (
          <div className="development-banner" role="status">
            开发样例环境 · 账号、判题与记录使用本地开发服务，重启后重置
          </div>
        )}
        <main id="main-content" className="content">
          {warning && (
            <div className="notice amber" role="status">
              {warning}{' '}
              <button className="btn small" onClick={() => void recheck()}>
                重新确认登录状态
              </button>
            </div>
          )}
          {children}
          <footer className="page-footer">
            <span>知序 · 理解空间，建立联系</span>
            <span>学习 / 思考 / 回顾</span>
          </footer>
        </main>
      </div>
    </>
  );
}
