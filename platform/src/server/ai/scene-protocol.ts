import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { universalSchema } from '@/features/geometry/universal';

// Export the same contract used by the evaluator, including union variants and tuple bounds.
export const sceneContract = JSON.stringify(
  z.toJSONSchema(universalSchema, { target: 'draft-7', reused: 'ref' }),
);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readModelPlan(input: unknown) {
  if (!record(input)) return input;
  const raw = structuredClone(input);
  const plan = Object.keys(raw).length === 1 && record(raw.plan) ? raw.plan : raw;
  // These strings have no geometric meaning in the wire protocol.
  const dropAnnotation = (obj: Record<string, unknown>) => {
    if (typeof obj.description === 'string') delete obj.description;
  };
  dropAnnotation(plan);
  for (const key of ['nodes', 'segments', 'faces', 'checks', 'solids', 'metrics']) {
    const rows = plan[key];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!record(row)) continue;
      dropAnnotation(row);
      if (key === 'nodes' && row.type === 'fixed' && Object.hasOwn(row, 'coordinates')) {
        if (!Object.hasOwn(row, 'position') || isDeepStrictEqual(row.position, row.coordinates)) {
          row.position = row.coordinates;
          delete row.coordinates;
        }
      }
    }
  }
  return plan;
}

type Target = { section: string; index: number };
const collections = new Set([
  'nodes',
  'skills',
  'faces',
  'solids',
  'metrics',
  'segments',
  'parameters',
  'checks',
  'coverage',
]);
export function repairTargets(error: unknown, plan: unknown): Target[] {
  if (!(error instanceof z.ZodError) || !record(plan)) return [];
  const targets: Target[] = [];
  for (const issue of error.issues) {
    const [section, index] = issue.path;
    if (
      typeof section !== 'string' ||
      !collections.has(section) ||
      typeof index !== 'number' ||
      !Array.isArray(plan[section]) ||
      !record(plan[section][index])
    )
      return [];
    if (!targets.some((t) => t.section === section && t.index === index))
      targets.push({ section, index });
  }
  return targets;
}

const repairsSchema = z
  .object({
    repairs: z
      .array(
        z
          .object({
            section: z.string(),
            index: z.number().int().nonnegative(),
            value: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();

export function applyModelRepair(previous: unknown, targets: Target[], response: unknown) {
  if (!record(previous)) throw new Error('缺少待修复方案');
  const copy = structuredClone(previous);
  // Some models return a whole plan despite requesting patches. Read only the requested slots.
  const full = readModelPlan(response);
  const isWholePlan =
    record(full) && Object.hasOwn(full, 'nodes') && !Object.hasOwn(full, 'repairs');
  const patches = isWholePlan
    ? targets.map(({ section, index }) => ({
        section,
        index,
        value: Array.isArray(full[section]) ? full[section][index] : undefined,
      }))
    : repairsSchema.parse(response).repairs;
  if (patches.length !== targets.length) throw new Error('修复条数不匹配');
  for (const { section, index } of targets) {
    const patch = patches.find((p) => p.section === section && p.index === index);
    const rows = copy[section];
    if (!Array.isArray(rows) || !record(patch?.value)) throw new Error('缺少指定位置的修复');
    if (typeof rows[index].id === 'string' && rows[index].id !== patch.value.id)
      throw new Error('局部修复不能更改已有对象编号');
    rows[index] = patch.value;
  }
  return copy;
}
