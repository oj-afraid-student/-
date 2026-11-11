import type { NextRequest } from 'next/server';
import { success } from '@/server/http';
import { practiceResponse } from '@/server/practice/request';
import { getPractice } from '@/server/practice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return practiceResponse(request, async (user) => {
    return success(await getPractice(user.id, (await context.params).id));
  });
}
