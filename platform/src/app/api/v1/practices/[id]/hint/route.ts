import type { NextRequest } from 'next/server';
import { requestHint } from '@/server/ai/learning';
import { success } from '@/server/http';
import { practiceResponse, readJson } from '@/server/practice/request';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return practiceResponse(request, async (user) =>
    success(await requestHint(user.id, (await context.params).id, await readJson(request))),
  );
}
