import type { Construction, GeometryScene } from './scene';
export type Exploration = { theta: number; constructions: Construction[] };
export type History = { past: Exploration[]; present: Exploration; future: Exploration[] };
export type Action =
  | { type: 'commit'; value: Exploration }
  | { type: 'preview'; value: Exploration }
  | { type: 'checkpoint' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: Exploration };
export function historyReducer(state: History, action: Action): History {
  if (action.type === 'reset') return { past: [], present: action.value, future: [] };
  if (action.type === 'preview') return { ...state, present: action.value };
  if (action.type === 'checkpoint')
    return { ...state, past: [...state.past.slice(-49), state.present], future: [] };
  if (action.type === 'commit')
    return { past: [...state.past.slice(-49), state.present], present: action.value, future: [] };
  if (action.type === 'undo' && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
    };
  if (action.type === 'redo' && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}
export function connectPoints(
  scene: GeometryScene,
  existing: Construction[],
  selected: string[],
): Construction[] {
  if (
    selected.length !== 2 ||
    selected[0] === selected[1] ||
    selected.some((id) => !scene.points.some((p) => p.id === id))
  )
    throw new Error('请先选择两个不同的点。');
  const key = [...selected].sort().join('-');
  if ([...scene.segments, ...existing].some((s) => [...s.points].sort().join('-') === key))
    throw new Error('这两个点之间已存在线段，无需重复构造。');
  if (existing.length >= 32) throw new Error('最多保留 32 条辅助线。');
  return [...existing, { id: `user-${key}`, points: [selected[0], selected[1]] }];
}
