import { logAi, withAiTrace } from '@/server/ai/trace';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { practiceResponse, readJson } from '@/server/practice/request';
import { ApiError, success } from '@/server/http';
import { problemSchema, photoSchema } from '@/shared/study-contract';
import { decideFold } from '@/server/ai/fold-decision';
import { generateUniversal } from '@/server/ai/universal-generator';
const schema = z.object({ problem: problemSchema, photo: photoSchema.optional() }).strict();
export async function POST(request: NextRequest) {
  return withAiTrace(request, async () => {
    const start = Date.now();
    const response = await practiceResponse(request, async () => {
      const parsed = schema.safeParse(await readJson(request));
      if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 400, '请核对原题和图片');
      const { problem, photo } = parsed.data;
      const foldDecision = await decideFold(problem);
      return success({
        ...(await generateUniversal(problem, photo, { foldRequired: foldDecision.required })),
        foldDecision,
      });
    });
    const error = response.ok ? undefined : (await response.clone().json()).error;
    logAi('geometry-scene.response', {
      status: response.status,
      elapsedMs: Date.now() - start,
      ...(error ? { code: error.code } : {}),
    });
    return response;
  });
}
