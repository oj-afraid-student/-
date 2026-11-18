import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/);
const vec = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const pair = z.tuple([id, id]);
const triple = z.tuple([id, id, id]);
export const metricSchema = z.discriminatedUnion('type', [
  z.object({ id, label: z.string().max(80), type: z.literal('distance'), points: pair }).strict(),
  z
    .object({ id, label: z.string().max(80), type: z.literal('height'), point: id, plane: triple })
    .strict(),
  z
    .object({
      id,
      label: z.string().max(80),
      type: z.literal('line_angle'),
      lines: z.tuple([pair, pair]),
    })
    .strict(),
]);
export const sceneSchema = z
  .object({
    version: z.literal('1.0'),
    id,
    title: z.string().max(120),
    facts: z.array(z.string().max(300)).max(20),
    assumptions: z.array(z.string().max(300)).max(20),
    points: z
      .array(z.object({ id, label: z.string().max(20), initial: vec }).strict())
      .min(3)
      .max(32),
    segments: z.array(z.object({ id, points: pair }).strict()).max(64),
    // Phase 1 explicitly supports convex coplanar triangles/quadrilaterals only.
    faces: z
      .array(
        z
          .object({
            id,
            vertices: z.array(id).min(3).max(4),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          })
          .strict(),
      )
      .max(16),
    constraints: z
      .array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('fixed'), points: z.array(id).min(1).max(32) }).strict(),
          z.object({ type: z.literal('rigid'), face: id }).strict(),
          z.object({ type: z.literal('initial_midpoint'), point: id, of: pair }).strict(),
        ]),
      )
      .max(32),
    motion: z
      .object({
        type: z.literal('hinge'),
        axis: pair,
        moving: z.array(id).min(1).max(32),
        sign: z.union([z.literal(1), z.literal(-1)]),
        min: z.literal(0),
        max: z
          .number()
          .positive()
          .max(Math.PI / 2),
        initial: z.number().nonnegative(),
      })
      .strict()
      .optional(),
    metrics: z.array(metricSchema).max(16),
  })
  .strict();
export type GeometryScene = z.infer<typeof sceneSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type Vec3 = [number, number, number];
export type Positions = Record<string, Vec3>;
export type Construction = { id: string; points: [string, string] };

// Future AI adapter must produce evidence-bearing facts, never executable expressions.
export interface ProblemIR {
  version: '1.0';
  text: string;
  facts: { text: string; source: 'text' | 'diagram_label' | 'user'; confirmed: boolean }[];
  uncertainties: string[];
}
