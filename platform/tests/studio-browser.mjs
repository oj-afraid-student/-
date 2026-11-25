import './helpers/server-loader.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.ZHIXU_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.ZHIXU_BROWSER_EXECUTABLE,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const base = process.env.ZHIXU_TEST_URL || 'http://127.0.0.1:3000';
fs.mkdirSync('.local', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1844, height: 1040 } });
  const credentials = { username: 'studio_' + Date.now().toString(36), password: 'StudioTest_42' };
  assert.ok(
    (await context.request.post(base + '/api/v1/auth/register', { data: credentials })).ok(),
  );
  assert.ok((await context.request.post(base + '/api/v1/auth/login', { data: credentials })).ok());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/geometry');
  await page.locator('canvas').waitFor();
  await page.getByLabel('测量点1', { exact: true }).selectOption('S1');
  await page.getByLabel('测量点2', { exact: true }).selectOption('S2');
  await page.getByRole('button', { name: '添加观察', exact: true }).click();
  assert.match(await page.getByRole('listbox', { name: '测量记录' }).innerText(), /5\.0000/);
  await page.getByRole('button', { name: '增大字号', exact: true }).click();
  await page.getByRole('button', { name: '增大线宽', exact: true }).click();
  await page.getByRole('button', { name: '长度标注', exact: true }).click();
  await page.screenshot({ path: '.local/studio-cylinder.png' });
  await page.getByLabel('示例题目').selectOption('hemisphere');
  await page.getByRole('button', { name: '加载示例', exact: true }).click();
  await page.screenshot({ path: '.local/studio-hemisphere.png' });
  await page.getByRole('button', { name: '模型设置', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByLabel('示例题目').selectOption('ratio');
  await page.getByRole('button', { name: '加载示例', exact: true }).click();
  await page.getByRole('button', { name: '选择点 B', exact: true }).click();
  await page.getByRole('button', { name: '选择点 C', exact: true }).click();
  await page.getByRole('button', { name: '取中点', exact: true }).click();
  await page.getByRole('button', { name: '选择点 M1', exact: true }).waitFor();
  await page.getByRole('button', { name: '连辅助线', exact: true }).click();
  assert.ok(await page.getByRole('button', { name: '撤销辅助', exact: true }).isEnabled());
  await page.getByRole('button', { name: '撤销辅助', exact: true }).click();
  await page.getByRole('button', { name: '选折叠面', exact: true }).click();
  await page.getByLabel('选择折叠面', { exact: true }).selectOption('base');
  await page.getByRole('button', { name: '用选中两点建立折痕', exact: true }).click();
  await page.getByLabel('折叠参数', { exact: true }).selectOption('userFold1');
  await page.getByLabel('折叠角度', { exact: true }).fill('80');
  assert.equal(await page.getByLabel('折叠角度', { exact: true }).inputValue(), '80');
  await page.getByRole('button', { name: '加载示例', exact: true }).click();
  await page.getByRole('button', { name: '选轨迹点', exact: true }).click();
  await page.getByLabel('轨迹点', { exact: true }).selectOption('Ap');
  await page.getByTestId('trace-length').waitFor();
  await page.getByLabel('折叠角度', { exact: true }).fill('150');
  await page.getByRole('button', { name: '展开复位', exact: true }).click();
  assert.equal(await page.getByLabel('折叠角度', { exact: true }).inputValue(), '0');
  await page.getByRole('button', { name: '播放演示', exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector('input[aria-label="折叠角度"]').value) > 0,
  );
  await page.getByRole('button', { name: '暂停演示', exact: true }).click();
  await page.getByRole('button', { name: '清除折叠', exact: true }).click();
  assert.ok(await page.getByLabel('折叠角度', { exact: true }).isDisabled());
  await page.getByRole('button', { name: '启用折叠', exact: true }).click();
  await page.getByRole('button', { name: '俯视', exact: true }).click();
  const handle = page.getByRole('button', { name: '选择点 E', exact: true });
  const bounds = await handle.boundingBox();
  const slider = page.getByRole('slider', { name: 'BE 长度（DF 自动取一半）' });
  const before = await slider.inputValue();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2 + 10, {
    steps: 10,
  });
  await page.mouse.up();
  assert.notEqual(await slider.inputValue(), before);
  await page.getByRole('button', { name: '视角复位', exact: true }).click();
  await page.screenshot({ path: '.local/studio-fold.png' });
  await page.getByRole('button', { name: '上一条历史', exact: true }).click();
  await page.getByRole('button', { name: '上一条历史', exact: true }).click();
  assert.match(await page.getByLabel('题目文字', { exact: true }).inputValue(), /四个球/);
  await page.getByRole('button', { name: '下一条历史', exact: true }).click();
  const settings = await context.request.get(base + '/api/v1/ai/settings');
  const config = await settings.json();
  assert.ok(config.data.model);
  assert.ok(!JSON.stringify(config).includes('sk-'));
  // Controlled recognition response verifies the review gate independently of model quality.
  const { studioExample } = await import('../src/features/geometry/studio-examples.ts');
  const { validateUniversal } = await import('../src/features/geometry/universal.ts');
  const fixture = studioExample('ratio');
  let generationCalls = 0;
  await page.route('**/api/v1/ai/study', (route) =>
    route.fulfill({
      json: { data: { ...fixture.problem, uncertainties: ['请核对 F 所在边'] }, error: null },
    }),
  );
  await page.route('**/api/v1/ai/geometry-scene', (route) => {
    generationCalls++;
    const sent = route.request().postDataJSON();
    assert.deepEqual(sent.problem.uncertainties, []);
    return route.fulfill({
      json: { data: validateUniversal(fixture.plan, fixture.problem), error: null },
    });
  });
  await page
    .locator('input[type=file]')
    .setInputFiles('../docs/test/geometry/rectangle-ratio-fold.jpg');
  await page.getByRole('button', { name: '识别并生成', exact: true }).click();
  await page.getByRole('button', { name: '已核对并补充条件', exact: true }).waitFor();
  assert.equal(generationCalls, 0);
  assert.ok(await page.getByAltText('当前题目原图').isVisible());
  assert.match(await page.locator('.studio-import-error').innerText(), /待核对/);
  await page
    .getByRole('button', { name: '已核对并补充条件', exact: true })
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.getByRole('button', { name: '已核对并补充条件', exact: true }).click();
  await page.getByRole('button', { name: '生成 / 更新模型', exact: true }).click();
  await page.getByRole('button', { name: '选择点 E', exact: true }).waitFor();
  assert.equal(generationCalls, 1);
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/studio-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  console.log(
    'PASS studio: curves, measures, style controls, midpoint, auxiliary lines, trace, fold playback/reset, point dragging, history, settings, responsive layout',
  );
  await context.close();
} finally {
  await browser.close();
}
