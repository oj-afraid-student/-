import assert from 'node:assert/strict';
const { chromium } = await import(process.env.ZHIXU_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.ZHIXU_BROWSER_EXECUTABLE,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const base = process.env.ZHIXU_TEST_URL || 'http://127.0.0.1:3000';
try {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: width === 390,
    });
    const credentials = { username: 'fold_' + Date.now().toString(36), password: 'FoldTest_42' };
    assert.ok((await ctx.request.post(base + '/api/v1/auth/register', { data: credentials })).ok());
    assert.ok((await ctx.request.post(base + '/api/v1/auth/login', { data: credentials })).ok());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const kind of ['trajectory', 'ratio']) {
      await page.goto(base + '/geometry?example=' + kind);
      await page.locator('canvas').waitFor();
      await page.getByRole('button', { name: '选轨迹点', exact: true }).click();
      if (kind === 'trajectory') {
        await page.getByLabel('轨迹点', { exact: true }).selectOption('G');
        assert.match(await page.getByTestId('trace-length').innerText(), /2\.221/);
      }
      const slider = page.getByRole('slider', {
        name: kind === 'trajectory' ? '折叠角度' : 'BE 长度（DF 自动取一半）',
        exact: true,
      });
      await slider.fill('0');
      await slider.fill('200');
      await slider.fill('100');
      await page
        .getByRole('button', { name: kind === 'trajectory' ? '正视' : '俯视', exact: true })
        .click();
      const handle = page.getByRole('button', {
        name: kind === 'trajectory' ? '选择点 P' : '选择点 E',
        exact: true,
      });
      await handle.scrollIntoViewIfNeeded();
      const box = await handle.boundingBox();
      assert.ok(box);
      const before = await slider.inputValue();
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      if (width === 390) {
        const touch = await ctx.newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        for (let i = 1; i <= 12; i++)
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: start.x + (65 * i) / 12, y: start.y - (45 * i) / 12 }],
          });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
      } else {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 65, start.y - 45, { steps: 12 });
        await page.mouse.up();
      }
      assert.notEqual(await slider.inputValue(), before);
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      console.log('PASS', kind, width, 'studio drag and endpoints');
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
