import { request } from '@/shared/api/client';
import type { LearningApi } from '@/shared/api/learning-api';
import { withPublishedQuestions, type GraphStructure } from './graph-model';

export async function loadGraphStructure(
  readQuestions: LearningApi['publishedGraphQuestions'],
  signal: AbortSignal,
): Promise<GraphStructure> {
  const [directory, questions] = await Promise.all([
    request<GraphStructure>('', '/content/geometry-knowledge-map.json', { signal }),
    readQuestions(signal),
  ]);
  return withPublishedQuestions(directory, questions);
}
