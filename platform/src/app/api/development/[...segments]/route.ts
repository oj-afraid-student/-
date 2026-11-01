import type { NextRequest } from 'next/server';
import { ApiError, failure } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: NextRequest, context: { params: Promise<{ segments: string[] }> }) {
  // Production always returns 404, even if the flag is accidentally present.
  if (process.env.NODE_ENV !== 'development' || process.env.ZHIXU_DEV_FIXTURES !== '1')
    return failure(new ApiError('NOT_FOUND', 404, '没有找到这个接口。'));
  let response;
  try {
    const { segments } = await context.params;
    const { handleDevelopment } = await import('@/server/development/fixture-service');
    response = await handleDevelopment(request, segments);
  } catch (error) {
    response = failure(error);
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const GET = handle;
export const POST = handle;
