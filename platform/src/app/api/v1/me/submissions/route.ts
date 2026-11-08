import type { NextRequest } from 'next/server';
import { success } from '@/server/http';
import { practiceResponse } from '@/server/practice/request';
import { listSubmissions } from '@/server/practice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  return practiceResponse(
    request,
    async (user) => {
      return success(await listSubmissions(user.id, request.nextUrl.searchParams));
    },
    true,
  );
}
