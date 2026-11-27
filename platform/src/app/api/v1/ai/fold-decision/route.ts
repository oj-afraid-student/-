import { type NextRequest } from 'next/server';
import { decideFold } from '@/server/ai/fold-decision';
import { problemSchema } from '@/shared/study-contract';
import { practiceResponse, readJson } from '@/server/practice/request';
import { ApiError, success } from '@/server/http';
import { withAiTrace } from '@/server/ai/trace';

export async function POST(request: NextRequest) {
  return withAiTrace(request, () =>
    practiceResponse(request, async () => {
      const problem = problemSchema.safeParse(await readJson(request));
      if (!problem.success) throw new ApiError('VALIDATION_ERROR', 400, '请提供已识别的完整题目');
      return success(await decideFold(problem.data));
    }),
  );
}
