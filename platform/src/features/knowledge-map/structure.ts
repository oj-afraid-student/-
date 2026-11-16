import { validateStructure, type GraphNode, type GraphStructure } from './graph-model';

// Layout-only structure. Deliberately contains no subject material or invented question tags.
const nodes: GraphNode[] = [{ id: 'overview', label: '知识总览', parentId: null }];
for (const topic of ['A', 'B', 'C', 'D']) {
  const topicId = 'topic-' + topic;
  nodes.push({ id: topicId, label: '专题 ' + topic, parentId: 'overview' });
  for (let unit = 1; unit <= 3; unit++) {
    const unitId = topicId + '-' + unit;
    nodes.push({ id: unitId, label: '单元 ' + topic + unit, parentId: topicId });
    for (let index = 0; index < (unit === 3 ? 6 : 4); index++)
      nodes.push({
        id: unitId + '-' + index,
        label: '知识点 ' + String.fromCharCode(65 + index),
        parentId: unitId,
      });
  }
}
export const placeholderStructure: GraphStructure = { nodes, placeholder: true };
export async function loadGraphStructure(signal: AbortSignal): Promise<GraphStructure> {
  signal.throwIfAborted();
  return validateStructure(placeholderStructure);
}
