import 'server-only';
import { ApiError } from '@/server/http';
import { MODEL_TIMEOUT_MS } from '@/shared/api/timeouts';

export type ModelContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

/** Shared by tutoring and geometry recognition. Credentials stay on the server. */
export async function modelJson(system: string, content: ModelContent): Promise<unknown> {
  const { ZHIXU_AI_API_KEY: key, ZHIXU_AI_BASE_URL: base, ZHIXU_AI_MODEL: model } = process.env;
  if (!key || !base || !model) throw new ApiError('SERVICE_UNAVAILABLE', 503, '模型服务尚未配置。');
  const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  try {
    const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1800,
      }),
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw new Error('Model request failed');
    const body = await response.json();
    const choice = body.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string')
      throw new Error('Incomplete model response');
    return JSON.parse(choice.message.content);
  } catch {
    throw new ApiError(
      'SERVICE_UNAVAILABLE',
      503,
      signal.aborted ? '模型响应超时，请重试。' : '模型服务暂不可用或返回格式异常，请重试。',
    );
  }
}
