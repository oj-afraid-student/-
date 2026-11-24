import type { NextRequest } from 'next/server';
import { suggestTags } from '@/server/ai/tags';
import { practiceResponse, readJson } from '@/server/practice/request';
import { success } from '@/server/http';

export async function POST(request: NextRequest) {
  return practiceResponse(request, async () => success(await suggestTags(await readJson(request))));
}
