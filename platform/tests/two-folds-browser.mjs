import assert from 'node:assert/strict';
const { chromium } = await import(process.env.ZHIXU_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ZHIXU_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ZHIXU_BROWSER_EXECUTABLE
    ? { executablePath: process.env.ZHIXU_BROWSER_EXECUTABLE }
    : {}),
  args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
});
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const credentials = { username: 'fold_' + Date.now().toString(36), password: 'FoldTest_42' };
    assert.ok(
      (await context.request.post(base + '/api/v1/auth/register', { data: credentials })).ok(),
    );
    assert.ok(
      (await context.request.post(base + '/api/v1/auth/login', { data: credentials })).ok(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const kind of ['trajectory', 'ratio']) {
      await page.goto(base + '/geometry?example=' + kind);
      await page.getByRole('button', { name: '为本题生成可视化方案' }).click();
      await page.getByRole('button', { name: /已核对，打开/ }).click();
      await page.locator('canvas').waitFor();
      if (kind === 'trajectory') {
        assert.match(await page.getByTestId('trace-length').innerText(), /2\.221/);
        const slider = page.getByRole('slider', { name: 'P 从 A 到 F 的翻折角' });
        await slider.fill('0');
        await slider.fill('200');
      } else {
        const slider = page.getByRole('slider', { name: 'BE 长度（DF 自动取一半）' });
        await slider.fill('0');
        await slider.fill('200');
        await slider.fill('100');
        const angle = page.getByRole('slider', { name: '绕 EF 的翻折角' });
        await angle.fill('200');
        await angle.fill('67');
      }
      await page.screenshot({ path: '.local/fold-' + kind + '-' + width + '.png', fullPage: true });
      assert.deepEqual(errors, []);
      assert.deepEqual(
        (await page.getByRole('alert').allTextContents()).filter((x) => x.trim()),
        [],
      );
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      );
      console.log('PASS', kind, width, 'real HTTP recipe generation, WebGL, sliders, bounds');
    }
    await context.close();
  }
} finally {
  await browser.close();
}
