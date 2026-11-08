import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import type { CurrentUser } from '@/shared/contracts';
import { requireCurrentUser } from '@/server/auth';
import { readBody, requireNoBody, validateRequest } from '@/server/auth/request';
import { ApiError, failure } from '@/server/http';
import { invalid } from './rules';

export async function readJson(request: NextRequest): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  )
    invalid('请求需要使用 JSON 格式。');
  const raw = await readBody(request);
  try {
    return JSON.parse(raw);
  } catch {
    return invalid('请求需要合法的 JSON。');
  }
}

export async function practiceResponse(
  request: NextRequest,
  work: (user: CurrentUser) => Promise<NextResponse>,
  paginated = false,
): Promise<NextResponse> {
  let response: NextResponse;
  try {
    if (!paginated) validateRequest(request);
    const user = await requireCurrentUser();
    if (request.method === 'GET') await requireNoBody(request);
    response = await work(user);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    response = failure(
      !(error instanceof ApiError) &&
        (/^08/.test(code) ||
          ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P02', '57P03', '53300'].includes(
            code,
          ))
        ? new ApiError('SERVICE_UNAVAILABLE', 503, '暂时无法读取或保存，请稍后使用原答案重试。')
        : error,
    );
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Cookie');
  return response;
}
