import { request } from './client';
import { HINT_REQUEST_TIMEOUT_MS } from './timeouts';

interface KnowledgeTag {
  id: string;
  title: string;
  reason: string;
}

export function requestKnowledgeTags(stem: string, fields: string[], signal?: AbortSignal) {
  return request<{ tags: KnowledgeTag[] }>('/api/v1', '/ai/candidates/tags', {
    method: 'POST',
    body: { stem, fields },
    signal,
    timeoutMs: HINT_REQUEST_TIMEOUT_MS,
  });
}

export const UPLOAD_TOPIC_PARAM = 'topic';
export const UPLOAD_TOPIC_LIMIT = 6;
export const STUDY_RETURN_PARAM = 'studyReturn';

export function uploadedTopicHref(ids: string[], returnId: string) {
  const query = new URLSearchParams();
  for (const id of [...new Set(ids)].slice(0, UPLOAD_TOPIC_LIMIT))
    query.append(UPLOAD_TOPIC_PARAM, id);
  query.set(STUDY_RETURN_PARAM, returnId);
  return '/knowledge-map?' + query.toString();
}

export function studyReturnHref(id: string) {
  return '/study?' + new URLSearchParams({ [STUDY_RETURN_PARAM]: id }).toString();
}
