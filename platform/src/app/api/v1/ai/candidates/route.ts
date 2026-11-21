import type { NextRequest } from 'next/server';
import { candidateScopes } from '@/server/ai/scope';
import { generateCandidate } from '@/server/ai/learning';
import { success } from '@/server/http';
import { practiceResponse, readJson } from '@/server/practice/request';

export async function POST(request: NextRequest) {
  return practiceResponse(request, async () =>
    success(await generateCandidate(await readJson(request))),
  );
}

export async function GET(request: NextRequest) {
  return practiceResponse(request, async () => success(await candidateScopes()));
}
