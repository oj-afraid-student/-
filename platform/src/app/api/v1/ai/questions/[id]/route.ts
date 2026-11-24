import type { NextRequest } from 'next/server';
import { loadQuestionForRevision } from '@/server/ai/revision';
import { success } from '@/server/http';
import { practiceResponse } from '@/server/practice/request';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return practiceResponse(request, async (user) =>
    success(await loadQuestionForRevision(user.id, id)),
  );
}
