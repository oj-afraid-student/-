/** Normalize only declared identifiers/unique display-label aliases, never geometric content. */
export function normalizeSceneIds(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const copy = structuredClone(raw) as Record<string, unknown>;
  const ids = new Set<string>(),
    labels = new Map<string, Set<string>>();
  function collect(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const o = value as Record<string, unknown>;
    if (typeof o.id === 'string') {
      ids.add(o.id);
      if (typeof o.label === 'string') {
        const set = labels.get(o.label) ?? new Set();
        set.add(o.id);
        labels.set(o.label, set);
      }
    }
    Object.values(o).forEach(collect);
  }
  collect(copy);
  const mapping = new Map<string, string>();
  let index = 0;
  for (const id of ids) {
    let target = id;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,24}$/.test(id)) {
      do {
        target = 'generated' + index++;
      } while (ids.has(target));
    }
    mapping.set(id, target);
  }
  for (const [label, set] of labels)
    if (!mapping.has(label) && set.size === 1) mapping.set(label, mapping.get([...set][0])!);
  const referenceKeys = new Set([
    'id',
    'source',
    'ends',
    'reference',
    'points',
    'axis',
    'plane',
    'lines',
    'line',
    'point',
    'base',
    'top',
    'apex',
    'parameter',
    'vertices',
  ]);
  function walk(value: unknown, key = ''): unknown {
    if (typeof value === 'string')
      return referenceKeys.has(key) ? (mapping.get(value) ?? value) : value;
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    return value;
  }
  return walk(copy);
}
