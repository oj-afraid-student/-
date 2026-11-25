import type { Figure, PublicQuestion } from '@/shared/contracts';

export interface GraphNode {
  id: string;
  label: string;
  parentId: string | null;
  kind?: 'overview' | 'group' | 'unit' | 'point';
  code?: string;
  summary?: string;
  paragraphs?: string[];
  figures?: Figure[];
  knowledgeIds?: string[];
  /** Optional link to a separately provided detail page. */
  detailHref?: string;
}
export interface GraphStructure {
  nodes: GraphNode[];
  placeholder: boolean;
  questions?: GraphQuestion[];
}
export function validateStructure(data: GraphStructure): GraphStructure {
  const ids = new Map(data.nodes.map((node) => [node.id, node]));
  if (ids.size !== data.nodes.length) throw new Error('知识节点编号重复，请检查目录数据。');
  if (data.nodes.length && data.nodes.filter((node) => node.parentId === null).length !== 1)
    throw new Error('知识结构需要一个总览节点。');
  for (const node of data.nodes) {
    if (!node.id.trim() || !node.label.trim()) throw new Error('知识节点缺少编号或名称。');
    const seen = new Set([node.id]);
    let parent = node.parentId;
    while (parent !== null) {
      if (!ids.has(parent)) throw new Error('知识结构中存在缺失的上级节点。');
      if (seen.has(parent)) throw new Error('知识结构中存在循环关系。');
      seen.add(parent);
      parent = ids.get(parent)!.parentId;
    }
  }
  return data;
}
export function ancestors(nodes: GraphNode[], id: string): GraphNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path: GraphNode[] = [];
  let node = byId.get(id);
  while (node) {
    path.unshift(node);
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return path;
}
export function uploadTopicPaths(nodes: GraphNode[], codes: readonly string[]) {
  const requested = new Set(codes);
  const leaves = nodes.filter((node) => node.kind === 'point' && requested.has(node.code ?? ''));
  const leafIds = new Set(leaves.map((node) => node.id));
  const nodeIds = new Set(
    leaves.flatMap((node) => ancestors(nodes, node.id).map((entry) => entry.id)),
  );
  return {
    leafIds,
    nodeIds,
    nodes: nodes.filter((node) => nodeIds.has(node.id)),
    partial: leafIds.size < requested.size,
  };
}

export function radialLayout(nodes: GraphNode[], focusId: string) {
  const focus = nodes.find((node) => node.id === focusId);
  if (!focus) throw new Error('当前知识节点不存在。');
  const parent = nodes.find((node) => node.id === focus.parentId);
  const children = nodes.filter((node) => node.parentId === focus.id);
  const neighbors = [...(parent ? [parent] : []), ...children];
  // Equal angles; increase radius with degree, keeping circles and labels apart.
  const radius = Math.max(230, (neighbors.length * 160) / (2 * Math.PI));
  const points = new Map([[focus.id, { x: 0, y: 0 }]]);
  neighbors.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / neighbors.length;
    points.set(node.id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  });
  return { points, parent, children, extent: 2 * (radius + 88) };
}

export interface GraphQuestion {
  id: string;
  version: number;
  title: string;
  stem: string;
  knowledgeIds: string[];
  unitIds: string[];
  figures: Figure[];
  options?: { id: string; text: string }[];
  prompts?: { id: string; prompt: string }[];
  readingOnly: boolean;
  needsReview: boolean;
}
export function questionsForNode(data: GraphStructure, id: string): GraphQuestion[] {
  const subtree = data.nodes.filter((node) =>
    ancestors(data.nodes, node.id).some((n) => n.id === id),
  );
  const tags = new Set(subtree.flatMap((n) => n.knowledgeIds ?? []));
  return (data.questions ?? []).filter((q) => q.knowledgeIds.some((tag) => tags.has(tag)));
}

/** Keep the authored graph layout and review notes. The catalog supplies the live questions. */
export function withPublishedQuestions(
  directory: GraphStructure,
  questions: PublicQuestion[],
): GraphStructure {
  const underReview = new Map(
    directory.questions?.filter((q) => q.needsReview).map((q) => [q.id, q.version]),
  );
  return {
    ...directory,
    questions: questions.map((q) => ({
      id: q.id,
      version: q.version,
      title: q.title,
      stem: q.stem,
      knowledgeIds: q.knowledgeIds,
      unitIds: q.unitIds,
      figures: q.figures,
      options: 'options' in q ? q.options : undefined,
      prompts: 'parts' in q ? q.parts : 'statements' in q ? q.statements : undefined,
      readingOnly: false,
      needsReview: underReview.get(q.id) === q.version,
    })),
  };
}

export function graphFocus(
  data: GraphStructure,
  requestedNode: string | null,
  requestedQuestion: string | null,
): GraphNode {
  const explicit = data.nodes.find((node) => node.id === requestedNode);
  if (explicit) return explicit;
  const question = data.questions?.find((q) => q.id === requestedQuestion);
  const point =
    question &&
    data.nodes.find(
      (node) => node.kind === 'point' && node.code && question.knowledgeIds.includes(node.code),
    );
  return point || data.nodes.find((node) => node.parentId === null)!;
}
