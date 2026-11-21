import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.ZHIXU_PLAYWRIGHT_MODULE || 'playwright');
const { problem, result } = JSON.parse(fs.readFileSync('.local/universal-live.json', 'utf8'));
const base = process.env.ZHIXU_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ZHIXU_BROWSER_EXECUTABLE
    ? { executablePath: process.env.ZHIXU_BROWSER_EXECUTABLE }
    : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const credentials = { username: 'vis_' + Date.now().toString(36), password: 'GeometryQa_42' };
    assert.ok(
      (await context.request.post(base + '/api/v1/auth/register', { data: credentials })).ok(),
    );
    assert.ok(
      (await context.request.post(base + '/api/v1/auth/login', { data: credentials })).ok(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/study');
    await page.route('**/api/v1/ai/study', async (route) => {
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: {
          data:
            body.action === 'recognize'
              ? problem
              : { hint: '先观察折痕两侧的点。', check: '哪些长度保持不变？', limitations: [] },
          error: null,
        },
      });
    });
    await page.locator('input[type=file]').first().setInputFiles('/tmp/geometry-diagram.jpg');
    await page.getByText('图片已选择，可以识别').waitFor();
    await page.getByRole('button', { name: '识别并整理题目' }).click();
    await page.locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: '给我一个下一步提示', exact: true }).click();
    await page.getByRole('button', { name: 'AI 可视化 · 前往几何实验室' }).click();
    await page.waitForURL('**/geometry?task=*');
    await page.getByAltText('本题原图，供核对几何关系').waitFor();
    await page.route('**/api/v1/ai/geometry-scene', async (route) => {
      assert.ok(route.request().postDataJSON().photo.startsWith('data:image/jpeg'));
      await route.fulfill({ json: { data: result, error: null } });
    });
    await page.getByRole('button', { name: '为本题生成可视化方案' }).click();
    await page.getByRole('button', { name: /已核对，打开/ }).click();
    await page.locator('canvas').waitFor();
    const slider = page.getByRole('slider').first();
    await slider.fill('100');
    await slider.dispatchEvent('change');
    const points = page.getByRole('button', { name: /选择点 / });
    await points.nth(0).click();
    await points.nth(1).click();
    await page.getByRole('button', { name: '连接辅助线', exact: true }).click();
    await page.getByRole('button', { name: '撤销辅助线', exact: true }).click();
    await page.screenshot({ path: '.local/universal-' + width + '.png', fullPage: true });
    assert.deepEqual(errors, []);
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    );
    console.log(
      'browser passed',
      width,
      'image transfer, controls, WebGL, auxiliary lines; AI responses replayed',
    );
    await context.close();
  }
} finally {
  await browser.close();
}
