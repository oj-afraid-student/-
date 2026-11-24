import 'server-only';
import { ApiError } from '@/server/http';
import { problemSchema, type StudyProblem } from '@/shared/study-contract';
import { modelJson, type ModelContent } from './model';
import { reviewDiagram } from './diagram-review';
import { RECOGNITION_TEMPLATE, RECOGNITION_LENGTH_RETRY } from './recognition-template';

export async function recognizeStudyProblem(text: string, photo?: string): Promise<StudyProblem> {
  const content: ModelContent = photo
    ? [
        {
          type: 'text',
          text: JSON.stringify({
            supplementaryText: text,
            task: '识别主体题目，排除邻题和批注；保留全部小问。',
          }),
        },
        { type: 'image_url', image_url: { url: photo } },
      ]
    : text;
  const output = await modelJson(RECOGNITION_TEMPLATE, content, 8000, {
    recoverLength: true,
    timeoutMs: 70000,
    lengthRetryInstruction: RECOGNITION_LENGTH_RETRY,
  });
  const parsed = problemSchema.safeParse(output);
  if (!parsed.success)
    throw new ApiError(
      'SERVICE_UNAVAILABLE',
      503,
      '模型返回的题目结构不完整，请重试或补充主体题目文字。',
    );
  const recognized = parsed.data;
  if (!photo || !recognized.diagram?.length) return recognized;
  try {
    return await reviewDiagram(recognized, photo);
  } catch {
    return {
      ...recognized,
      uncertainties: [
        ...recognized.uncertainties,
        '图示复核未完成：已保留题干识别结果，请对照原图检查点边关系。',
      ].slice(-20),
    };
  }
}
