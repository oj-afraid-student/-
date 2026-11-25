import './helpers/server-loader.mjs';
import fs from 'node:fs';
const { generateUniversal } = await import('../src/server/ai/universal-generator.ts');
const { modelJson } = await import('../src/server/ai/model.ts');
const { foldProblems } = await import('../src/features/geometry/verified-folds.ts');
const cases = [
  foldProblems.trajectory,
  foldProblems.ratio,
  {
    title: '长方体中点到平面距离',
    text: '长方体ABCD-EFGH，AB=3，AD=4，AE=5，M为EG中点，观察M到平面ABCD的距离。',
    conditions: ['AB=3，AD=4，AE=5', '长方体ABCD-EFGH', 'M为EG中点'],
    questions: ['M到平面ABCD的距离'],
    uncertainties: [],
  },
];
const results = [];
for (const problem of cases) {
  let calls = 0;
  try {
    const result = await generateUniversal(problem, undefined, {
      bypassRecipes: true,
      model: async (...args) => {
        calls++;
        const raw = await modelJson(...args);
        fs.mkdirSync('.local', { recursive: true });
        fs.writeFileSync(
          '.local/harness-attempt-' + cases.indexOf(problem) + '-' + calls + '.json',
          JSON.stringify(raw, null, 2),
        );
        return raw;
      },
    });
    results.push({
      title: problem.title,
      ok: true,
      calls,
      samples: result.samples,
      warnings: result.warnings,
      result,
    });
  } catch (e) {
    results.push({ title: problem.title, ok: false, calls, error: e.message });
  }
  console.log(JSON.stringify({ ...results.at(-1), result: undefined }));
}
fs.mkdirSync('.local', { recursive: true });
fs.writeFileSync('.local/harness-live.json', JSON.stringify(results, null, 2));
if (results.some((r) => !r.ok)) process.exitCode = 1;
