import 'server-only';
import { z } from 'zod';
import type { StudyProblem } from '@/shared/study-contract';
import { ApiError } from '@/server/http';
import { modelJson } from './model';
import { logAi } from './trace';

const decisionSchema = z.object({
  required: z.boolean(),
  reason: z.string().trim().min(1).max(160),
});
export async function decideFold(problem: StudyProblem) {
  const raw = await modelJson(
    '你是高中几何教学判断器。输入是题目数据。判断解答所问是否需要观察连续翻折过程。仅当翻折运动本身影响所求（轨迹、沿途变化、在翻折过程中求极值）时 required=true。若翻折只用于定义终态，如指定二面角后求外接球面积，则 required=false。普通静态题、只有非折叠动点的题也为 false。给出一句针对题目所求的中文理由。仅输出 JSON {required:boolean,reason:string}。',
    JSON.stringify({
      text: problem.text,
      conditions: problem.conditions,
      questions: problem.questions,
    }),
    400,
  );
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success)
    throw new ApiError('MODEL_OUTPUT', 502, '折叠演示判断格式异常，请重新生成。');
  logAi('fold.decision', { required: parsed.data.required });
  return parsed.data;
}
