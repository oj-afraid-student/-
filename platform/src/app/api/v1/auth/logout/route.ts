import type { NextRequest } from 'next/server';
import { success } from '@/server/http';
import { authResponse, requireNoBody } from '@/server/auth/request';
import { logoutUser, SESSION_COOKIE, sessionCookieOptions } from '@/server/auth/service';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  return authResponse(request, async () => {
    await requireNoBody(request);
    await logoutUser(request.cookies.get(SESSION_COOKIE)?.value);
    const response = success({ success: true });
    response.cookies.set(SESSION_COOKIE, '', {
      ...sessionCookieOptions,
      maxAge: 0,
      expires: new Date(0),
    });
    return response;
  });
}
