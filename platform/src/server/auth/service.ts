import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Credentials, CurrentUser } from '@/shared/contracts';
import { getPool, withTransaction } from '@/server/db';
import { ApiError } from '@/server/http';
import { hashPassword, verifyPassword } from './password';

export const SESSION_COOKIE = 'zhixu_session';
export const SESSION_SECONDS = 8 * 60 * 60;
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

async function database<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const code = errorCode(error);
    if (
      code.startsWith('08') ||
      [
        'ECONNREFUSED',
        'ECONNRESET',
        'ENOTFOUND',
        'EHOSTUNREACH',
        'ETIMEDOUT',
        'EPIPE',
        '57P01',
        '57P02',
        '57P03',
        '53300',
      ].includes(code) ||
      (error instanceof Error &&
        /connection timeout|timeout exceeded when trying to connect/i.test(error.message))
    ) {
      throw new ApiError('SERVICE_UNAVAILABLE', 503, '账号服务暂时不可用，请稍后重试。');
    }
    throw error;
  }
}

function validToken(token: string | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function registerUser(credentials: Credentials): Promise<CurrentUser> {
  const passwordHash = await hashPassword(credentials.password);
  return database(async () => {
    try {
      const { rows } = await getPool().query<CurrentUser>(
        'INSERT INTO app_user (username, password_hash) VALUES ($1, $2) RETURNING id, username',
        [credentials.username, passwordHash],
      );
      return rows[0];
    } catch (error) {
      if (errorCode(error) === '23505') {
        throw new ApiError('CONFLICT', 409, '用户名已存在，请换一个用户名。');
      }
      throw error;
    }
  });
}

export async function loginUser(credentials: Credentials, previousToken?: string) {
  return database(async () => {
    const { rows } = await getPool().query<CurrentUser & { password_hash: string }>(
      'SELECT id, username, password_hash FROM app_user WHERE username = $1',
      [credentials.username],
    );
    const account = rows[0];
    const validPassword = await verifyPassword(credentials.password, account?.password_hash);
    if (!account || !validPassword) {
      throw new ApiError('UNAUTHENTICATED', 401, '用户名或密码不正确。');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    await withTransaction(async (client) => {
      if (validToken(previousToken)) {
        await client.query('DELETE FROM app_session WHERE token_hash = $1', [
          tokenHash(previousToken),
        ]);
      }
      await client.query(
        'INSERT INTO app_session (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [account.id, tokenHash(token), expiresAt],
      );
    });
    return { user: { id: account.id, username: account.username }, token, expiresAt };
  });
}

export async function sessionUser(token: string | undefined): Promise<CurrentUser> {
  if (!validToken(token)) throw new ApiError('UNAUTHENTICATED', 401, '请先登录后继续。');
  return database(async () => {
    const { rows } = await getPool().query<CurrentUser>(
      `SELECT u.id, u.username FROM app_session s
       JOIN app_user u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash(token)],
    );
    if (!rows[0]) throw new ApiError('UNAUTHENTICATED', 401, '登录状态已失效，请重新登录。');
    return rows[0];
  });
}

export async function logoutUser(token: string | undefined): Promise<void> {
  if (!validToken(token)) return;
  await database(async () => {
    await getPool().query('DELETE FROM app_session WHERE token_hash = $1', [tokenHash(token)]);
  });
}
