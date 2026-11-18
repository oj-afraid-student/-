// Optional QA runner; Playwright is external to the application dependencies.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  process.env.ZHIXU_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.ZHIXU_PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const base = process.env.ZHIXU_TEST_URL ?? 'http://127.0.0.1:3100';
const output = process.env.ZHIXU_QA_OUTPUT ?? '/tmp/geometry-qa';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
  ...(process.env.ZHIXU_BROWSER_EXECUTABLE
    ? { executablePath: process.env.ZHIXU_BROWSER_EXECUTABLE }
    : {}),
});
try {
  for (const viewport of [
    { width: 1600, height: 1100 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 500,
      hasTouch: viewport.width < 500,
    });
    const credentials = { username: `geo_${Date.now().toString(36)}`, password: 'GeometryTest42' };
    assert.ok(
      (
        await context.request.post(base + '/api/development/auth/register', { data: credentials })
      ).ok(),
    );
    assert.ok(
      (
        await context.request.post(base + '/api/development/auth/login', { data: credentials })
      ).ok(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [],
      aiCalls = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (req) => {
      if (/\/hint|\/ai\//.test(req.url())) aiCalls.push(req.url());
    });
    await page.goto(base + '/geometry');
    await page.getByRole('heading', { name: '立体几何实验室' }).waitFor();
    await page.locator('canvas').waitFor();
    const canvas = page.locator('canvas');
    await canvas.scrollIntoViewIfNeeded();
    const area = await canvas.boundingBox();
    const pointB = page.getByRole('button', { name: '选择点 B', exact: true });
    await pointB.waitFor();
    const original = await pointB.boundingBox();
    await page.mouse.move(area.x + area.width / 2, area.y + 50);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width / 2 + 60, area.y + 80, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    assert.notDeepEqual(await pointB.boundingBox(), original);
    await page.mouse.wheel(0, 100);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(area.x + area.width / 2 + 30, area.y + 60, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    await page.getByRole('button', { name: '重置镜头', exact: true }).click();
    const angle = page.getByRole('spinbutton', { name: '角度数值' });
    await angle.fill('30');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="metric-height"]')?.textContent === '0.8944',
    );
    // Actual scene labels, not only the fallback point list.
    await page
      .getByRole('button', { name: '选择点 A′', exact: true })
      [viewport.width < 500 ? 'tap' : 'click']();
    await page
      .getByRole('button', { name: '选择点 C', exact: true })
      [viewport.width < 500 ? 'tap' : 'click']();
    await page.getByRole('button', { name: '连接辅助线', exact: true }).click();
    const before = await page.getByTestId('selected-length').textContent();
    await angle.fill('75');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="metric-height"]')?.textContent === '1.7279',
    );
    assert.notEqual(await page.getByTestId('selected-length').textContent(), before);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await angle.inputValue(), '30');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.equal(await angle.inputValue(), '75');
    await page.getByRole('button', { name: '连接辅助线', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '已存在线段' }).waitFor();
    await page.getByText('显示与验证', { exact: true }).click();
    await page.getByRole('checkbox', { name: '显示底面' }).uncheck();
    await page.getByRole('checkbox', { name: '显示底面' }).check();
    await angle.fill('0');
    await page.getByRole('button', { name: '播放折叠' }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('input[aria-label="角度数值"]').value) > 1,
    );
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await angle.fill('90');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="metric-height"]')?.textContent === '1.7889',
    );
    for (const name of ['俯视', '前视', '等轴测', '重置镜头'])
      await page.getByRole('button', { name, exact: true }).click();
    await angle.fill('45');
    await page.getByText('显示与验证', { exact: true }).click();
    await page.getByRole('heading', { name: '立体几何实验室' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({
      path: `${output}/${viewport.width < 500 ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
      style: 'nextjs-portal { display: none; }',
    });
    await page.getByRole('button', { name: '恢复初始', exact: true }).click();
    assert.equal(await angle.inputValue(), '30');
    assert.equal(
      await page.getByRole('combobox', { name: '选择线段', exact: true }).locator('option').count(),
      7,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(aiCalls, []);
    console.log(
      `PASS ${viewport.width}px: real WebGL, scene selection, construction, metrics, history, playback, visibility, camera controls, reset, no AI calls`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
