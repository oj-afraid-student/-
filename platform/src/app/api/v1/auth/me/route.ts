import type { NextRequest } from 'next/server';
import { success } from '@/server/http';
import { requireCurrentUser } from '@/server/auth';
import { authResponse, requireNoBody } from '@/server/auth/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  return authResponse(request, async () => {
    await requireNoBody(request);
    return success(await requireCurrentUser());
  });
}
