import 'server-only';
import { sceneContract, readModelPlan, repairTargets, applyModelRepair } from './scene-protocol';
import { rhombicPrismMotion } from '@/features/geometry/rhombic-prism';
import { rhombusSphere } from '@/features/geometry/rhombus-sphere';
import { logAi } from './trace';
import { ApiError } from '@/server/http';
import { ZodError } from 'zod';
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
    foldRequired?: boolean;
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
    if (options.foldRequired !== false) verifyMotionEndpoints(checked.plan, problem);
    if (options.foldRequired === false && checked.plan.parameters.some((p) => p.unit === 'rad'))
      throw new Error('本题只需固定构型，请使用题设终态的固定角度，不得设置可调折角。');
    if (options.foldRequired === true && !checked.plan.parameters.some((p) => p.unit === 'rad'))
      throw new Error('本题需要连续翻折，请提供与动点旋转关联的角度参数。');
    return checked;
  };
  const prism =
    !options.bypassRecipes && options.foldRequired !== true && rhombicPrismMotion(problem);
  if (prism) {
    logAi('plan.recipe', { kind: 'rhombicPrismMotion' });
    try {
      return validate(prism);
    } catch (e) {
      throw validationFailure(e, 1);
    }
  }
  const staticPlan =
    !options.bypassRecipes && options.foldRequired === false && rhombusSphere(problem);
  if (staticPlan) {
    logAi('plan.recipe', { kind: 'rhombusSphere' });
    try {
      return validate(staticPlan);
    } catch (e) {
      throw validationFailure(e, 1);
    }
  }
  const known =
    options.bypassRecipes || options.foldRequired === false ? null : matchVerifiedFold(problem);
  if (known) {
    logAi('plan.recipe', { kind: known });
    let checked;
    try {
      checked = validate(verifiedFold(known, problem));
    } catch (e) {
      throw validationFailure(e, 1);
    }
    return { ...checked, verification: '已匹配经数学检查的折叠构造；请核对原题与下方条件一致' };
  }
  let correction = '';
  let previous: unknown;
  let targets: ReturnType<typeof repairTargets> = [];
  const generationStarted = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const text =
      JSON.stringify(problem) +
      (options.foldRequired === false
        ? '\n本题不需要折叠演示。根据题设终态直接计算坐标或使用固定角度旋转；注意二面角和翻折转角的区别。不得生成可调角度。'
        : '') +
      '\n必须满足的独立题设检查（点名为原题标签，不可删除或修改）：' +
      JSON.stringify(required) +
      '\ncoverage逐行复制以下index和quote，每个输入条件恰好一行，不拆分条件、不为题干或问题追加索引：' +
      JSON.stringify(problem.conditions.map((quote, index) => ({ index, quote }))) +
      correction;
    const content: ModelContent = photo
      ? [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: photo } },
        ]
      : text;
    logAi('plan.model', { attempt: attempt + 1 });
    const reply = await (options.model ?? modelJson)(
      UNIVERSAL_PROMPT +
        PLANNING_GUIDE +
        SOLID_GUIDE +
        '\n完整方案的权威 JSON Schema（字段和类型以此为准）：' +
        sceneContract +
        (targets.length
          ? '\n本轮只返回 {"repairs":[{"section":"集合名","index":零起始下标,"value":完整修正条目}]}，每个指定位置一次。保持对象id及题设约束。'
          : ''),
      content,
      7000,
    );
    let raw: unknown;
    try {
      raw = readModelPlan(targets.length ? applyModelRepair(previous, targets, reply) : reply);
      return validate(raw);
    } catch (e) {
      const failure = validationFailure(e, attempt + 1, raw);
      // An item patch can fix the wire format yet expose a separate geometry error.
      // Reserve one bounded whole-plan repair for that transition only.
      const geometryAfterPatch =
        attempt === 1 &&
        targets.length > 0 &&
        raw !== undefined &&
        failure.code === 'SCENE_CONSTRAINT' &&
        Date.now() - generationStarted < 12000;
      if (attempt > 0 && !geometryAfterPatch) throw failure;
      previous = raw;
      targets = repairTargets(e, raw);
      logAi('plan.repair', { mode: targets.length ? 'items' : 'full', count: targets.length });
      correction =
        '\n上次方案未通过确定性检查，请修正构造，不要删除或放松约束来规避错误。错误：' +
        failure.message +
        '\n上次方案：' +
        JSON.stringify(raw) +
        (targets.length ? '\n只替换以下位置：' + JSON.stringify(targets) : '');
    }
  }
  throw new Error('未生成可用方案');
}

function validationFailure(e: unknown, attempt: number, raw?: unknown) {
  const schema = e instanceof ZodError;
  const detail = schema
    ? e.issues
        .slice(0, 3)
        .map((issue) => {
          if (issue.code === 'unrecognized_keys') {
            const keys = issue.keys
              .filter((k) => /^[a-zA-Z_][a-zA-Z_0-9]{0,40}$/.test(k))
              .slice(0, 6);
            return (
              (issue.path.join('.') || '方案顶层') +
              ' 含协议未定义的字段：' +
              keys.join(', ') +
              '。仅使用协议声明的字段，说明文字放入 reason。'
            );
          }
          const [field, index, key] = issue.path;
          if (field === 'metrics' && typeof index === 'number' && issue.code === 'invalid_union')
            return (
              '第' +
              (index + 1) +
              '条测量格式不匹配。请按 Schema 选择 distance(points)、height(point,plane)、point_line(point,line) 或 line_angle(lines)，同时提供 id 和 label。'
            );
          if (
            field === 'checks' &&
            typeof index === 'number' &&
            key === 'type' &&
            issue.code === 'invalid_union'
          ) {
            const checks =
              raw && typeof raw === 'object' && 'checks' in raw ? raw.checks : undefined;
            const type = Array.isArray(checks) ? checks[index]?.type : undefined;
            const name =
              typeof type === 'string' && /^[a-z_]{1,32}$/i.test(type) ? '（' + type + '）' : '';
            return (
              '第' +
              (index + 1) +
              '条几何检查的类型缺失或不受支持' +
              name +
              '。支持 line_plane_parallel、angle、dihedral、distance、ratio、length_multiple、perpendicular、parallel。请用等价的受支持约束表达；无法验证的条件须标为 unresolved。'
            );
          }
          return issue.path.join('.') + ' ' + issue.code;
        })
        .join(', ')
    : e instanceof Error
      ? e.message
      : '未知校验错误';
  const reason = detail
    .replace(/data:image[^\s]*/gi, '[image]')
    .replace(/sk-[\w-]+/g, '[secret]')
    .slice(0, 220);
  const code = schema ? 'SCENE_SCHEMA' : 'SCENE_CONSTRAINT';
  logAi('plan.rejected', { attempt, code, reason });
  return new ApiError(code, 422, (schema ? '构造方案结构错误：' : '几何约束未满足：') + reason);
}
