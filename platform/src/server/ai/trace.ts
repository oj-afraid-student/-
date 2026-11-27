import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';

const context = new AsyncLocalStorage<string>();
export function withAiTrace<T>(request: Request, work: () => T) {
  const header = request.headers.get('x-generation-id') ?? '';
  return context.run(/^[0-9a-f-]{36}$/i.test(header) ? header : randomUUID(), work);
}

export function logAi(event: string, fields: Record<string, number | string | boolean> = {}) {
  const record = JSON.stringify({
    time: new Date().toISOString(),
    id: context.getStore(),
    event,
    ...fields,
  });
  console.info('[geometry]', record);
  if (process.env.NODE_ENV !== 'production') {
    try {
      mkdirSync('.local', { recursive: true });
      appendFileSync('.local/geometry-attempts.jsonl', record + '\n', { mode: 0o600 });
    } catch {
      console.warn('[geometry] local log unavailable');
    }
  }
}
