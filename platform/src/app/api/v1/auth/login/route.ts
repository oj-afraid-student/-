import type { NextRequest } from 'next/server';
import { success } from '@/server/http';
import { authResponse, readCredentials } from '@/server/auth/request';
import {
  loginUser,
  SESSION_COOKIE,
  SESSION_SECONDS,
  sessionCookieOptions,
} from '@/server/auth/service';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  return authResponse(request, async () => {
    const result = await loginUser(
      await readCredentials(request),
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    const response = success(result.user);
    response.cookies.set(SESSION_COOKIE, result.token, {
      ...sessionCookieOptions,
      maxAge: SESSION_SECONDS,
      expires: result.expiresAt,
    });
    return response;
  });
}
