import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { practiceResponse, readJson } from '@/server/practice/request';
import { ApiError, success } from '@/server/http';
import { problemSchema, photoSchema } from '@/shared/study-contract';
import { generateUniversal } from '@/server/ai/universal-generator';
const schema = z.object({ problem: problemSchema, photo: photoSchema.optional() }).strict();
export async function POST(request: NextRequest) {
  return practiceResponse(request, async () => {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 400, '请核对原题和图片');
    const { problem, photo } = parsed.data;
    try {
      return success(await generateUniversal(problem, photo));
    } catch (e) {
      throw new ApiError(
        'SERVICE_UNAVAILABLE',
        503,
        '场景未通过检查：' +
          (e instanceof Error ? e.message.slice(0, 220) : '格式错误') +
          '。请核对条件后重试，当前不展示错误模型。',
      );
    }
  });
}
