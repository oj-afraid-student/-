import 'server-only';
import { NextResponse } from 'next/server';
import type { ApiErrorCode, ApiResponse } from '@/shared/contracts';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function success<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>({ data, error: null }, { status });
}

export function failure(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json<ApiResponse<never>>(
      { data: null, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  // 不将数据库异常、连接配置或堆栈返回给浏览器。
  console.error('[platform] request failed', error instanceof Error ? error.name : 'UnknownError');
  return NextResponse.json<ApiResponse<never>>(
    { data: null, error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试。' } },
    { status: 500 },
  );
}
