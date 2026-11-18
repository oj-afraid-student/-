import { z } from 'zod';
const text = z.string().trim().min(1).max(10000);
export const problemSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    text,
    conditions: z.array(z.string().max(1000)).max(30),
    questions: z.array(z.string().trim().min(1).max(2000)).min(1).max(15),
    uncertainties: z.array(z.string().max(1000)).max(20),
  })
  .strict();
export const studyInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('recognize'),
      text: z.string().max(12000),
      photo: z
        .string()
        .max(950000)
        .regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/)
        .optional(),
    })
    .strict()
    .refine((v) => v.text.trim() || v.photo),
  z
    .object({
      action: z.literal('hint'),
      problem: problemSchema,
      question: z.number().int().min(0).max(14),
      progress: z.string().max(12000),
      followup: z.string().max(2000),
    })
    .strict()
    .refine((v) => v.question < v.problem.questions.length),
]);
export const guidanceSchema = z
  .object({
    hint: z.string().trim().min(1).max(5000),
    check: z.string().max(2000),
    limitations: z.array(z.string().max(1000)).max(10),
  })
  .strict();
export type StudyProblem = z.infer<typeof problemSchema>;
export type StudyGuidance = z.infer<typeof guidanceSchema>;
