import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.ZHIXU_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.ZHIXU_BROWSER_EXECUTABLE,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  baseURL: process.env.ZHIXU_TEST_URL || 'http://127.0.0.1:3000',
});
const client = context.request;
try {
  const data = { username: 'photo_' + Date.now().toString(36), password: 'PhotoTest_42' };
  assert.ok((await client.post('/api/v1/auth/register', { data })).ok());
  assert.ok((await client.post('/api/v1/auth/login', { data })).ok());
  const photo =
    'data:image/jpeg;base64,' + fs.readFileSync(process.env.ZHIXU_TEST_IMAGE).toString('base64');
  const response = await client.post('/api/v1/ai/study', {
    data: { action: 'recognize', text: '', photo },
    timeout: 120000,
  });
  const body = await response.json();
  assert.ok(response.ok(), JSON.stringify(body));
  fs.writeFileSync('.local/fold-photo-result.json', JSON.stringify(body, null, 2));
  const problem = body.data;
  assert.ok(problem.conditions, 'recognition response has conditions');
  console.log(
    'Recognized conditions:',
    problem.conditions,
    'Uncertainties:',
    problem.uncertainties,
  );
  const plan = await client.post('/api/v1/ai/geometry-scene', {
    data: { problem, photo },
    timeout: 120000,
  });
  const result = await plan.json();
  assert.ok(plan.ok(), JSON.stringify(result));
  fs.writeFileSync('.local/fold-photo-plan.json', JSON.stringify(result, null, 2));
  assert.ok(result.data.plan.metrics.some((m) => m.type === 'point_line'));
  console.log('PASS photo recognition -> geometry generation:', result.data.verification);
} finally {
  await browser.close();
}
