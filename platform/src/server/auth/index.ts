import 'server-only';
import { cookies } from 'next/headers';
import type { CurrentUser } from '@/shared/contracts';
import { SESSION_COOKIE, sessionUser } from './service';

/** 由真实数据库会话读取当前用户；业务模块不接收浏览器指定的可信 userId。 */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const jar = await cookies();
  return sessionUser(jar.get(SESSION_COOKIE)?.value);
}
