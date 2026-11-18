// Explicit opt-in live DeepSeek smoke check; never runs in the default test suite.
import './helpers/server-loader.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { planSchema, auditPlan, compilePlan } = await import('../src/features/geometry/planner.ts');
const source = fs.readFileSync('src/app/api/v1/ai/geometry-plan/route.ts', 'utf8');
const prompt = [...source.matchAll(/'([^'\n]*你是几何模板选择器[^'\n]*)'/g)][0][1];
const problem = {
  title: '长方体',
  text: '长方体ABCD-PQRS，AB=3，BC=4，AP=12，求AR长。',
  conditions: ['长方体ABCD-PQRS', 'AB=3', 'BC=4', 'AP=12'],
  questions: ['求AR长'],
  uncertainties: [],
};
const response = await fetch(process.env.ZHIXU_AI_BASE_URL + '/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + process.env.ZHIXU_AI_API_KEY,
  },
  body: JSON.stringify({
    model: process.env.ZHIXU_AI_MODEL,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: JSON.stringify(problem) },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1800,
  }),
  signal: AbortSignal.timeout(45000),
});
assert.ok(response.ok, 'Model HTTP ' + response.status);
const body = await response.json();
const plan = planSchema.parse(JSON.parse(body.choices[0].message.content));
assert.deepEqual(auditPlan(plan, problem), []);
assert.ok(compilePlan(plan));
console.log('Live DeepSeek plan, condition coverage and geometry compilation passed.');
