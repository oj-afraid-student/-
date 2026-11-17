import type { NextRequest } from 'next/server';
import { canPublishCandidate, publishCandidate } from '@/server/ai/publish';
import { success } from '@/server/http';
import { practiceResponse, readJson } from '@/server/practice/request';

export async function GET(request: NextRequest) {
  return practiceResponse(request, async (user) =>
    success({
      allowed: canPublishCandidate(user.id),
      userId: user.id,
    }),
  );
}

export async function POST(request: NextRequest) {
  return practiceResponse(request, async (user) =>
    success(await publishCandidate(user.id, await readJson(request))),
  );
}
