import type { NextRequest } from 'next/server';
import { success } from '@/server/http';
import { practiceResponse, readJson } from '@/server/practice/request';
import { submitPractice } from '@/server/practice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return practiceResponse(request, async (user) => {
    const result = await submitPractice(
      user.id,
      (await context.params).id,
      await readJson(request),
    );
    return success(result.data, result.created ? 201 : 200);
  });
}
