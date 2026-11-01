'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { errorMessage, safeReturnPath } from '@/shared/api/client';
import { GeometryArt, Icon } from '@/shared/ui/icons';
import { useSession } from './session';

export function AuthForm({
  mode,
  registered = false,
  initialUsername = '',
}: {
  mode: 'login' | 'register';
  registered?: boolean;
  initialUsername?: string;
}) {
  const register = mode === 'register';
  const { api, setUser, user } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{4,20}$/.test(normalized)) {
      setError('用户名需为 4—20 位字母、数字或下划线。');
      return;
    }
    if (password.length < 8 || password.length > 64) {
      setError('密码长度需为 8—64 位，首尾空格也计入密码。');
      return;
    }
    if (register && password !== confirm) {
      setError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);
    try {
      if (register) {
        await api.register({ username: normalized, password });
        setPassword('');
        setConfirm('');
        router.push(`/login?registered=1&username=${encodeURIComponent(normalized)}`);
      } else {
        const user = await api.login({ username: normalized, password });
        setUser(user);
        setPassword('');
        router.replace(safeReturnPath(new URLSearchParams(window.location.search).get('returnTo')));
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Link className="brand" href="/learn">
          <span className="brandmark">知</span>
          <span>
            <strong>知序</strong>
            <small>让抽象，变得可理解</small>
          </span>
        </Link>
        <div className="auth-intro">
          <p className="eyebrow">THINK IN SPACE</p>
          <h1>
            看清空间，
            <br />
            理顺每一步思考。
          </h1>
          <p>
            从一个概念，到一段完整的推理。
            <br />
            在学习与练习之间，建立自己的知识联系。
          </p>
          <GeometryArt />
          <div className="auth-path">
            <span>01 理解概念</span>
            <span>02 动手练习</span>
            <span>03 回顾过程</span>
          </div>
        </div>
        <small>高中数学 · 立体几何学习空间</small>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          <span className="tag green">{register ? '建立你的学习空间' : '欢迎回到知序'}</span>
          <h2>{register ? '注册学生账号' : '登录学习账号'}</h2>
          <p className="muted">
            {register ? '保存每一次作答，让学习有迹可循。' : '继续探索概念、图形与推理之间的联系。'}
          </p>
          {!register && registered && (
            <p className="notice" role="status">
              注册成功，请使用新账号登录。
            </p>
          )}
          {user && (
            <p className="notice">
              已登录为 {user.username}，<Link href="/learn">返回学习空间</Link>。
            </p>
          )}
          <form onSubmit={submit} noValidate aria-busy={busy}>
            <label className="field">
              <span>用户名</span>
              <input
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={4}
                maxLength={20}
                required
                disabled={busy}
                placeholder="4—20 位字母、数字或下划线"
                aria-describedby="username-help"
              />
            </label>
            <p id="username-help" className="field-hint">
              用户名不区分大小写，注册后用于登录。
            </p>
            <label className="field">
              <span>密码</span>
              <span className="password-input">
                <input
                  name="password"
                  aria-label="密码"
                  type={visible ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={64}
                  required
                  disabled={busy}
                  placeholder="输入 8—64 位密码"
                />
                <button
                  type="button"
                  aria-label={visible ? '隐藏密码' : '显示密码'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? '隐藏' : '显示'}
                </button>
              </span>
            </label>
            {register && (
              <label className="field">
                <span>确认密码</span>
                <input
                  name="confirm-password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  maxLength={64}
                  required
                  disabled={busy}
                  placeholder="再次输入密码"
                />
              </label>
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary wide" type="submit" disabled={busy}>
              {busy ? '正在处理…' : register ? '注册账号' : '进入学习空间'}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="auth-switch">
            {register ? '已有账号？' : '还没有账号？'}{' '}
            <Link href={register ? '/login' : '/register'}>
              {register ? '前往登录' : '创建学生账号'}
            </Link>
          </p>
          <p className="auth-note">账号仅供学生使用。请妥善保管密码，公共设备使用后及时退出。</p>
        </div>
      </section>
    </div>
  );
}
