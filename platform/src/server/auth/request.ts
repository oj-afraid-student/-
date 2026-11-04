import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import type { Credentials } from '@/shared/contracts';
import { ApiError, failure } from '@/server/http';

const BODY_LIMIT = 1024 * 1024;
function invalid(message = '请求字段不符合契约。'): never {
  throw new ApiError('VALIDATION_ERROR', 400, message);
}

async function readBody(request: NextRequest): Promise<string> {
  const size = request.headers.get('content-length');
  if (size && (!/^\d+$/.test(size) || Number(size) > BODY_LIMIT)) invalid('请求内容过大。');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BODY_LIMIT) {
        await reader.cancel();
        invalid('请求内容不能超过 1 MiB。');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return invalid('请求内容需要使用 UTF-8 编码。');
  }
}

export function validateRequest(request: NextRequest): void {
  if (request.nextUrl.search) invalid('此接口不接受查询参数。');
  if (request.method !== 'POST') return;
  const origin = request.headers.get('origin');
  const expected = new URL(request.url);
  const host = request.headers.get('host');
  if (host) expected.host = host;
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin && origin !== expected.origin)
  ) {
    invalid('请从本站页面发起账号操作。');
  }
}

export async function readCredentials(request: NextRequest): Promise<Credentials> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  ) {
    invalid('账号请求需要使用 JSON 格式。');
  }
  let value: unknown;
  try {
    value = JSON.parse(await readBody(request));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return invalid('请求需要合法的 JSON。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const fields = value as Record<string, unknown>;
  if (
    Object.keys(fields).length !== 2 ||
    typeof fields.username !== 'string' ||
    typeof fields.password !== 'string'
  )
    invalid();
  const username = fields.username.trim().toLowerCase();
  const password = fields.password;
  if (!/^[a-z0-9_]{4,20}$/.test(username) || password.length < 8 || password.length > 64) {
    invalid('用户名需为 4—20 位字母、数字或下划线，密码长度需为 8—64 位。');
  }
  return { username, password };
}

export async function requireNoBody(request: NextRequest): Promise<void> {
  if ((await readBody(request)).length) invalid('此接口不接受请求体。');
}

export async function authResponse(request: NextRequest, work: () => Promise<NextResponse>) {
  let response: NextResponse;
  try {
    validateRequest(request);
    response = await work();
  } catch (error) {
    response = failure(error);
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Cookie');
  return response;
}
