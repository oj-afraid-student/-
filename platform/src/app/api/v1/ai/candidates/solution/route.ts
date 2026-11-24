import type { NextRequest } from 'next/server';
import { canPublishCandidate } from '@/server/ai/publish';
import { generateSolution } from '@/server/ai/solution';
import { ApiError, success } from '@/server/http';
import { practiceResponse, readJson } from '@/server/practice/request';
export async function POST(request: NextRequest) {
  return practiceResponse(request, async (user) => {
    if (!canPublishCandidate(user.id))
      throw new ApiError('VALIDATION_ERROR', 403, '只有题库复核员可以生成入库答案草稿。');
    return success(await generateSolution(await readJson(request)));
  });
}
