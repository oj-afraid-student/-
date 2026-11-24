import { recognizeStudyProblem } from '@/server/ai/recognition';
import type { NextRequest } from 'next/server';
import { generateStudyGuidance } from '@/server/ai/study-guidance';
import { ApiError, success } from '@/server/http';
import { practiceResponse, readJson } from '@/server/practice/request';
import { studyInputSchema, problemSchema, guidanceSchema } from '@/shared/study-contract';
export async function POST(request: NextRequest) {
  return practiceResponse(request, async () => {
    const parsed = studyInputSchema.safeParse(await readJson(request));
    if (!parsed.success)
      throw new ApiError('VALIDATION_ERROR', 400, '请检查题目、照片大小和分问内容。');
    const input = parsed.data;
    const output =
      input.action === 'recognize'
        ? await recognizeStudyProblem(input.text, input.photo)
        : await generateStudyGuidance(input);
    const result = (input.action === 'recognize' ? problemSchema : guidanceSchema).safeParse(
      output,
    );
    if (!result.success)
      throw new ApiError(
        'SERVICE_UNAVAILABLE',
        503,
        '模型返回的内容不完整，请重试或改用文字输入。',
      );
    return success(result.data);
  });
}
