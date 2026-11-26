import type { NextRequest } from 'next/server';
import { success } from '@/server/http';
import { practiceResponse } from '@/server/practice/request';
import { getStudentProgress } from '@/server/progress/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return practiceResponse(request, async (user) => success(await getStudentProgress(user.id)));
}
