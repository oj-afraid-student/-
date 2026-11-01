import 'server-only';
import type { CurrentUser } from '@/shared/contracts';
import { ApiError } from '@/server/http';

// AUTH-01 接入真实会话后替换实现。当前明确拒绝，不读取浏览器传入的 userId。
export async function requireCurrentUser(): Promise<CurrentUser> {
  throw new ApiError('NOT_IMPLEMENTED', 501, '账号与会话服务尚未接入。');
}
