import type { GraphNode } from './graph-model';

export function TopicPaths({
  nodes,
  leafIds,
  focusId,
  select,
  partial,
}: {
  nodes: GraphNode[];
  leafIds: Set<string>;
  focusId: string;
  select: (id: string) => void;
  partial: boolean;
}) {
  const byParent = new Map<string | null, GraphNode[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }

  function branches(parent: string | null) {
    const children = byParent.get(parent);
    if (!children?.length) return null;
    return (
      <ul>
        {children.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className="km-topic-node"
              data-node-id={node.id}
              data-topic-kind={leafIds.has(node.id) ? 'match' : 'ancestor'}
              aria-current={focusId === node.id ? 'location' : undefined}
              onClick={() => select(node.id)}
            >
              <span>{node.label}</span>
              {leafIds.has(node.id) && <small>命中知识点</small>}
            </button>
            {branches(node.id)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="km-topic-paths" aria-label="上传题知识点路径">
      <h2>本题涉及的知识路径</h2>
      <p>已定位 {leafIds.size} 个知识点及其上级。点击节点可查看详情和题库关联题目。</p>
      {partial && <p role="status">部分标签在当前图谱目录中找不到对应节点。</p>}
      {branches(null)}
    </section>
  );
}
