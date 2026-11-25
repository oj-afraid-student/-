import { z } from 'zod';

export const GRAPH_CHAT_QUESTION_LIMIT = 1000;
export const GRAPH_CHAT_HISTORY_LIMIT = 3;

const id = z.string().trim().min(1).max(128);
const inquiry = z.string().trim().min(1).max(GRAPH_CHAT_QUESTION_LIMIT);

export const graphChatReplySchema = z
  .object({ answer: z.string().trim().min(1).max(4500) })
  .strict();

export const graphChatInputSchema = z
  .object({
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('node'), id }).strict(),
      z.object({ kind: z.literal('question'), id, version: z.number().int().positive() }).strict(),
    ]),
    question: inquiry,
    history: z
      .array(z.object({ question: inquiry, answer: graphChatReplySchema.shape.answer }).strict())
      .max(GRAPH_CHAT_HISTORY_LIMIT),
  })
  .strict();

export type GraphChatTarget = z.infer<typeof graphChatInputSchema>['target'];
export type GraphChatReply = z.infer<typeof graphChatReplySchema>;
