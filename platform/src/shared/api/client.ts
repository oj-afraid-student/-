import type { ApiErrorCode, ApiResponse } from '@/shared/contracts';

export class ApiClientError extends Error {
  public readonly code: ApiErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';
  public readonly status: number;
  constructor(
    code: ApiErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE',
    status: number,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ApiClientError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请稍后重试。';
}

export async function request<T>(
  base: string,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError'))
      throw error;
    throw new ApiClientError(
      'NETWORK_ERROR',
      0,
      '连接中断，请检查网络。尚未确认本次操作是否完成。',
    );
  }
  let envelope: ApiResponse<T>;
  try {
    envelope = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      response.status,
      `接口暂不可用（HTTP ${response.status}），请检查业务服务是否已接入。`,
    );
  }
  if (!envelope || typeof envelope !== 'object' || !('data' in envelope) || !('error' in envelope))
    throw new ApiClientError('INVALID_RESPONSE', response.status, '接口响应格式不符合约定。');
  if (envelope.error)
    throw new ApiClientError(envelope.error.code, response.status, envelope.error.message);
  if (!response.ok || envelope.data === null)
    throw new ApiClientError('INVALID_RESPONSE', response.status, '接口没有返回可用的数据。');
  return envelope.data;
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !/^\/(learn(?:\/|\?|$)|practice\/|results\/|history(?:\?|$))/.test(value))
    return '/learn';
  if (value.includes('\\') || /[\r\n]/.test(value)) return '/learn';
  return value;
}
