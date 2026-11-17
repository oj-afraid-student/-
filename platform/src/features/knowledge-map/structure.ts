import { request } from '@/shared/api/client';
import { validateStructure, type GraphStructure } from './graph-model';

// A generated, public reading snapshot; no answer keys or grading configuration.
export async function loadGraphStructure(signal: AbortSignal): Promise<GraphStructure> {
  return validateStructure(
    await request<GraphStructure>('', '/content/geometry-knowledge-map.json', { signal }),
  );
}
