import 'server-only';
import { ApiError } from '@/server/http';
import { guidanceSchema, studyInputSchema } from '@/shared/study-contract';
import { HINT_MODEL_TIMEOUT_MS } from '@/shared/api/timeouts';
import { modelJson } from './model';
import { STUDY_HINT_TEMPLATE, HINT_LENGTH_RETRY } from './hint-template';

export async function generateStudyGuidance(value: unknown) {
  const parsed = studyInputSchema.safeParse(value);
  if (!parsed.success || parsed.data.action !== 'hint')
    throw new ApiError('VALIDATION_ERROR', 400, '请检查当前小问和作答上下文。');
  const { problem, question, progress, followup, previousProgress = [] } = parsed.data;
  const output = await modelJson(
    STUDY_HINT_TEMPLATE,
    JSON.stringify({
      problem,
      target: { index: question, text: problem.questions[question] },
      previousProgress: previousProgress.map((entry) => ({
        question: problem.questions[entry.question],
        index: entry.question,
        progress: entry.progress,
      })),
      studentProgress: progress,
      followup,
    }),
    8000,
    {
      recoverLength: true,
      timeoutMs: HINT_MODEL_TIMEOUT_MS,
      lengthRetryInstruction: HINT_LENGTH_RETRY,
    },
  );
  const result = guidanceSchema.safeParse(output);
  if (!result.success)
    throw new ApiError(
      'SERVICE_UNAVAILABLE',
      503,
      '模型返回的提示结构不完整，请重试；题目和作答仍会保留。',
    );
  return result.data;
}
