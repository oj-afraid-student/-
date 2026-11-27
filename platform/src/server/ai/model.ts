import 'server-only';
import { logAi } from './trace';
import { ApiError } from '@/server/http';
import { MODEL_TIMEOUT_MS } from '@/shared/api/timeouts';

export type ModelContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

/** Shared by tutoring and geometry recognition. Credentials stay on the server. */
export async function modelJson(
  system: string,
  content: ModelContent,
  maxTokens = 1800,
): Promise<unknown> {
  const { ZHIXU_AI_API_KEY: key, ZHIXU_AI_BASE_URL: base, ZHIXU_AI_MODEL: model } = process.env;
  if (!key || !base || !model) throw new ApiError('MODEL_CONFIG', 503, '模型服务尚未配置。');
  const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          ...(new URL(base).hostname === 'api.deepseek.com'
            ? { thinking: { type: 'disabled' } }
            : {}),
          messages: [
            {
              role: 'system',
              content:
                system +
                (attempt
                  ? '\n上次响应不是合法JSON。此次必须只输出一个合法JSON对象，不加Markdown围栏或解释；数学符号优先用Unicode，字符串中的反斜杠必须按JSON规则双写。'
                  : ''),
            },
            { role: 'user', content },
          ],
          response_format: { type: 'json_object' },
          max_tokens: Math.min(8000, Math.max(100, maxTokens)),
        }),
        cache: 'no-store',
        redirect: 'error',
        signal,
      });
      if (!response.ok) {
        const messages: Record<number, string> = {
          401: '模型密钥认证失败，请检查服务端配置。',
          403: '当前密钥没有调用该模型的权限。',
          402: '模型账户余额不足，请检查服务商账户。',
          429: '模型请求过于频繁或额度受限，请稍后重试。',
          400: '模型服务不接受当前请求，请检查模型是否支持图片与 JSON 输出。',
        };
        logAi('upstream.http', { status: response.status, attempt: attempt + 1 });
        throw new ApiError(
          response.status === 429 ? 'MODEL_RATE_LIMIT' : 'MODEL_UPSTREAM',
          response.status === 429 ? 429 : 502,
          messages[response.status] ??
            '模型服务返回错误（HTTP ' + response.status + '），请稍后重试。',
        );
      }
      const body = await response.json();
      const choice = body.choices?.[0];
      if (choice?.finish_reason === 'length')
        throw new ApiError(
          'MODEL_OUTPUT',
          502,
          '识别内容超出模型输出长度，未收到完整结果。请裁剪到一道题后重试。',
        );
      if (choice?.finish_reason === 'content_filter')
        throw new ApiError(
          'MODEL_OUTPUT',
          502,
          '模型服务未返回该图片的识别结果，请更换清晰题图后重试。',
        );
      if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string')
        throw new ApiError('MODEL_OUTPUT', 502, '模型未返回完整文本，请重试。');
      try {
        const raw = choice.message.content.trim();
        const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(raw);
        return JSON.parse(fenced ? fenced[1] : raw);
      } catch (parseError) {
        logAi('upstream.invalid_json', {
          attempt: attempt + 1,
          characters: choice.message.content.length,
          finishReason: choice.finish_reason,
          parseError: parseError instanceof Error ? parseError.name : 'UnknownError',
        });
        if (attempt === 0) continue;
        throw new ApiError(
          'MODEL_OUTPUT',
          502,
          '模型连续返回无效JSON，图片已保留。请裁剪到题目区域后重试。',
        );
      }
    }
    throw new ApiError('MODEL_OUTPUT', 502, '模型未返回可用结果。');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.warn(
      '[ai] transport_or_response_error',
      error instanceof Error ? error.name : 'UnknownError',
    );
    throw new ApiError(
      signal.aborted
        ? 'MODEL_TIMEOUT'
        : error instanceof SyntaxError
          ? 'MODEL_OUTPUT'
          : 'MODEL_UPSTREAM',
      signal.aborted ? 504 : 502,
      signal.aborted ? '模型响应超时，请重试。' : '模型服务暂不可用或返回格式异常，请重试。',
    );
  }
}
