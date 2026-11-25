import 'server-only';
import {
  extractRequiredChecks,
  enforceRequiredChecks,
  verifyMotionEndpoints,
} from '@/features/geometry/plan-harness';
import { matchVerifiedFold, verifiedFold } from '@/features/geometry/verified-folds';
import { normalizeSceneIds } from '@/features/geometry/normalize-ids';
import type { StudyProblem } from '@/shared/study-contract';
import { modelJson, type ModelContent } from './model';
import { UNIVERSAL_PROMPT, PLANNING_GUIDE, SOLID_GUIDE } from './universal-prompt';
import { validateUniversal } from '@/features/geometry/universal';
export async function generateUniversal(
  problem: StudyProblem,
  photo?: string,
  options: {
    bypassRecipes?: boolean;
    model?: typeof modelJson;
  } = {},
) {
  const required = extractRequiredChecks(problem);
  const validate = (raw: unknown) => {
    const checked = validateUniversal(
      enforceRequiredChecks(normalizeSceneIds(raw), required, problem),
      problem,
    );
    verifyMotionEndpoints(checked.plan, problem);
    return checked;
  };
  const known = options.bypassRecipes ? null : matchVerifiedFold(problem);
  if (known) {
    const checked = validate(verifiedFold(known, problem));
    return { ...checked, verification: '已匹配经数学检查的折叠构造；请核对原题与下方条件一致' };
  }
  let correction = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const text =
      JSON.stringify(problem) +
      '\n必须满足的独立题设检查（点名为原题标签，不可删除或修改）：' +
      JSON.stringify(required) +
      correction;
    const content: ModelContent = photo
      ? [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: photo } },
        ]
      : text;
    const raw = await (options.model ?? modelJson)(
      UNIVERSAL_PROMPT + PLANNING_GUIDE + SOLID_GUIDE,
      content,
      7000,
    );
    try {
      return validate(raw);
    } catch (e) {
      if (attempt === 1) throw e;
      correction =
        '\n上次方案未通过确定性检查，请修正构造，不要删除或放松约束来规避错误。错误：' +
        (e instanceof Error ? e.message.slice(0, 1200) : '无效方案') +
        '\n上次方案：' +
        JSON.stringify(raw);
    }
  }
  throw new Error('未生成可用方案');
}
