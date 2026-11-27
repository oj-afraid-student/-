import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { practiceResponse, readJson } from '@/server/practice/request';
import { ApiError, success } from '@/server/http';
import { logAi, withAiTrace } from '@/server/ai/trace';

const eventSchema = z
  .object({
    event: z.enum(['started', 'displayed', 'cancelled', 'failed']),
    stage: z.enum(['input', 'recognition', 'review', 'generation', 'coverage', 'display']),
  })
  .strict();
export async function POST(request: NextRequest) {
  return withAiTrace(request, () =>
    practiceResponse(request, async () => {
      const parsed = eventSchema.safeParse(await readJson(request));
      if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 400, '无效的操作记录');
      logAi('browser.' + parsed.data.event, { stage: parsed.data.stage });
      return success(true);
    }),
  );
}
