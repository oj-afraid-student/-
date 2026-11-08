import type { NextRequest } from 'next/server';
import { success } from '@/server/http';
import { practiceResponse, readJson } from '@/server/practice/request';
import { createPractice } from '@/server/practice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  return practiceResponse(request, async (user) => {
    return success(await createPractice(user.id, await readJson(request)), 201);
  });
}
