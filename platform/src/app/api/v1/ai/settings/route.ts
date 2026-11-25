import type { NextRequest } from 'next/server';
import { practiceResponse } from '@/server/practice/request';
import { success } from '@/server/http';
export async function GET(request: NextRequest) {
  return practiceResponse(request, async () =>
    success({
      model: process.env.ZHIXU_AI_MODEL ?? '',
      configured: !!(
        process.env.ZHIXU_AI_API_KEY &&
        process.env.ZHIXU_AI_BASE_URL &&
        process.env.ZHIXU_AI_MODEL
      ),
    }),
  );
}
