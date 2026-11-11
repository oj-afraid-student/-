import type { NextRequest } from 'next/server';
import { requireCurrentUser } from '@/server/auth';
import { authResponse, requireNoBody } from '@/server/auth/request';
import { getKnowledgeUnit } from '@/server/catalog/service';
import { success } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return authResponse(request, async () => {
    await requireCurrentUser();
    await requireNoBody(request);
    return success(await getKnowledgeUnit((await context.params).id));
  });
}
