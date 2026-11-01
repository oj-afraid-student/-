// Optional browser acceptance runner. Playwright is a separate QA tool, not an app dependency.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.ZHIXU_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const origin = process.env.ZHIXU_TEST_URL ?? 'http://127.0.0.1:3000';
const output = process.env.ZHIXU_QA_OUTPUT;
if (output) mkdirSync(output, { recursive: true });
const samplePractice = JSON.parse(
  readFileSync(new URL('../fixtures/api/practice/create-response.json', import.meta.url), 'utf8'),
).data;
const sampleAnswers = JSON.parse(
  readFileSync(new URL('../fixtures/api/practice/submit-request.json', import.meta.url), 'utf8'),
).answers;
const answers = new Map(
  samplePractice.items.map((item) => [
    item.question.id,
    sampleAnswers.find((answer) => answer.practiceItemId === item.id).answer,
  ]),
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ZHIXU_BROWSER_EXECUTABLE
    ? { executablePath: process.env.ZHIXU_BROWSER_EXECUTABLE }
    : { channel: 'msedge' }),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(error.message));
const check = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
async function screenshot(name, target = page) {
  if (output) await target.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
}
async function visibleText(text, target = page) {
  await target.getByText(text, { exact: true }).waitFor({ state: 'visible' });
}
async function login(username, password, target = page) {
  await target.goto(`${origin}/login`);
  await target.getByLabel('用户名', { exact: true }).fill(username);
  await target.getByLabel('密码', { exact: true }).fill(password);
  await target.getByRole('button', { name: '进入学习空间', exact: true }).click();
  await target.waitForURL('**/learn');
  await target.locator('.unit-card').first().waitFor();
}
async function createAll(target = page) {
  await target.goto(`${origin}/practice/new`);
  const response = target.waitForResponse(
    (response) =>
      response.url().endsWith('/api/development/practices') &&
      response.request().method() === 'POST',
  );
  await target.getByRole('button', { name: '创建并开始练习' }).click();
  const created = (await (await response).json()).data;
  await target.waitForURL(`**/practice/${created.id}`);
  await target.locator('.question-title').waitFor();
  return created;
}
async function submitCurrent(target = page) {
  await target
    .locator('.practice-sidebar')
    .getByRole('button', { name: '检查并提交', exact: true })
    .click();
  await target.getByRole('button', { name: '确认提交全部答案', exact: true }).click();
  await target.waitForURL('**/results/**');
  await target.locator('.result-hero').waitFor();
}
async function fillQuestion(item, answer, target = page) {
  const panel = target.locator('.question-panel');
  await panel.locator('.question-meta .code-label').filter({ hasText: item.question.id }).waitFor();
  if (answer.type === 'SINGLE_CHOICE')
    await panel.locator(`.answer-option input[value="${answer.selectedOptionId}"]`).check();
  else if (answer.type === 'MULTIPLE_CHOICE')
    for (const id of answer.selectedOptionIds)
      await panel.locator(`.answer-option input[value="${id}"]`).check();
  else if (answer.type === 'FILL_BLANK') {
    const fields = panel.locator('.blank-value input');
    const values = answer.blanks.flatMap((blank) => blank.values);
    assert.equal(await fields.count(), values.length);
    for (let i = 0; i < values.length; i++) await fields.nth(i).fill(values[i]);
  } else if (answer.type === 'JUDGMENT_REASON') {
    for (let i = 0; i < answer.judgments.length; i++) {
      const field = panel.locator('.written-part').nth(i);
      await field.getByLabel(answer.judgments[i].value ? '正确' : '错误', { exact: true }).check();
      await field.locator('textarea').fill(answer.judgments[i].reason);
    }
  } else {
    const fields = panel.locator('.written-part textarea');
    assert.equal(await fields.count(), answer.parts.length);
    for (let i = 0; i < answer.parts.length; i++) await fields.nth(i).fill(answer.parts[i].text);
  }
}
try {
  await page.goto(`${origin}/learn`);
  await page.waitForURL('**/login?returnTo=*');
  await page.getByRole('link', { name: '创建学生账号' }).click();
  await page.waitForURL('**/register');
  await page.getByRole('heading', { name: '注册学生账号', exact: true }).waitFor();
  await page.getByLabel('用户名', { exact: true }).fill('ab');
  await page.getByLabel('密码', { exact: true }).fill('123');
  await page.getByLabel('确认密码', { exact: true }).fill('123');
  await page.getByRole('button', { name: '注册账号', exact: true }).click();
  await visibleText('用户名需为 4—20 位字母、数字或下划线。');
  const username = `browser_${Date.now().toString(36)}`,
    password = 'browser-password-123';
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码', { exact: true }).fill(password);
  await screenshot('01-注册');
  await page.getByRole('button', { name: '注册账号', exact: true }).click();
  await page.waitForURL('**/login?registered=1&username=*');
  await visibleText('注册成功，请使用新账号登录。');
  await page.getByLabel('密码', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: '进入学习空间', exact: true }).click();
  await visibleText('用户名或密码不正确。');
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '进入学习空间', exact: true }).click();
  await page.waitForURL('**/learn');
  await page.locator('.unit-card').first().waitFor();
  assert.equal(await page.locator('.unit-card').count(), 6);
  await screenshot('02-知识目录');
  check('注册校验、注册不自动登录、错误密码与正常登录、六单元目录');
  await page.locator('a[href="/learn/SG-01"]').click();
  await page.locator('.knowledge-section').first().waitFor();
  assert.equal(await page.locator('.knowledge-section').count(), 4);
  assert.ok(await page.locator('.geometry-figure img').count());
  await screenshot('03-知识详情');
  check('知识段落、定理条件、例题、易错点与原图');
  await page.goto(`${origin}/history`);
  await visibleText('还没有提交记录');
  await page.goto(`${origin}/practice/new?unit=SG-01`);
  await page.getByLabel('题量（可选）').fill('99');
  await page.getByRole('button', { name: '创建并开始练习' }).click();
  await visibleText('匹配的题目只有 6 道，请减少题量。');
  check('空历史和筛选题量不足 409');
  const practice = await createAll();
  assert.equal(practice.totalCount, 24);
  assert.equal(await page.locator('.question-numbers button').count(), 24);
  assert.equal(await page.locator('.reference-explanation').count(), 0);
  await page
    .locator('.practice-sidebar')
    .getByRole('button', { name: '检查并提交', exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: '还有 24 题需要补全' }).waitFor();
  check('全量练习、未答定位、提交前没有解析');
  const covered = new Set();
  for (let i = 0; i < practice.items.length; i++) {
    const item = practice.items[i];
    await page.locator('.question-numbers button').nth(i).click();
    const answer = structuredClone(answers.get(item.question.id));
    if (item.question.id === 'Q01') answer.selectedOptionId = 'A';
    if (item.question.id === 'Q14') answer.blanks[0].values.reverse();
    await fillQuestion(item, answer);
    covered.add(item.question.type);
    if (item.question.id === 'Q06') {
      await page.reload();
      await page.locator('.question-numbers button.answered').nth(5).waitFor();
      assert.equal(await page.locator('.question-numbers button.answered').count(), 6);
      check('刷新恢复六题草稿');
    }
    if (item.question.id === 'Q14') await screenshot('04-多值填空');
    if (item.question.id === 'Q24') await screenshot('05-综合三问');
  }
  assert.equal(covered.size, 8);
  assert.equal(await page.locator('.question-numbers button.answered').count(), 24);
  check('实际填写全部 24 题和八题型，包括 Q06、Q14、Q24');
  await submitCurrent();
  const originalResultURL = page.url();
  await page.locator('.result-score').getByText('待复核', { exact: true }).waitFor();
  assert.equal(
    await page.locator('.result-stats .panel').nth(1).locator('strong').innerText(),
    '11',
  );
  assert.equal(
    await page.locator('.result-stats .panel').nth(2).locator('strong').innerText(),
    '10',
  );
  assert.equal(
    await page.locator('.result-stats .panel').nth(3).locator('strong').innerText(),
    '13',
  );
  assert.equal(await page.locator('.result-item').count(), 24);
  await screenshot('06-提交结果');
  await page.getByRole('button', { name: /^待复核13$/ }).click();
  assert.equal(await page.locator('.result-item').count(), 13);
  await page.getByRole('button', { name: /^错误1$/ }).click();
  assert.equal(await page.locator('.result-item').count(), 1);
  await screenshot('07-错题筛选');
  check('正确、错误、待复核三态及 null 总分');
  await page.getByRole('button', { name: '重练本次错题', exact: true }).click();
  await page.waitForURL('**/practice/**');
  await page.locator('.question-title').waitFor();
  assert.equal(await page.locator('.question-numbers button').count(), 1);
  await page.locator('.answer-option input[value="C"]').check();
  await submitCurrent();
  assert.match(await page.locator('.result-score').innerText(), /1\s*\/\s*1/);
  await page.goto(`${origin}/practice/${practice.id}`);
  await page.waitForURL(originalResultURL);
  await page.goto(`${origin}/history`);
  await page.locator('tbody tr').nth(1).waitFor();
  await screenshot('08-练习记录');
  check('错题重练创建新练习、旧结果保留、已提交练习恢复结果');

  // A failed response after commit must recover the saved result, not create a second submission.
  await page.goto(`${origin}/practice/new`);
  await page.getByRole('radio', { name: /指定题号/ }).check();
  await page.getByLabel('题号', { exact: true }).fill('Q01');
  await page.getByRole('button', { name: '创建并开始练习' }).click();
  await page.waitForURL('**/practice/**');
  await page.locator('.answer-option input[value="C"]').check();
  await page.route(
    '**/api/development/practices/*/submit',
    async (route) => {
      await route.fetch();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await submitCurrent();
  check('服务端已保存但响应丢失时恢复同一结果');

  // A failure before commit keeps the exact snapshot locked until retry.
  await page.goto(`${origin}/practice/new`);
  await page.getByRole('radio', { name: /指定题号/ }).check();
  await page.getByLabel('题号', { exact: true }).fill('Q01');
  await page.getByRole('button', { name: '创建并开始练习' }).click();
  await page.waitForURL('**/practice/**');
  await page.locator('.answer-option input[value="C"]').check();
  let originalPayload;
  await page.route(
    '**/api/development/practices/*/submit',
    async (route) => {
      originalPayload = route.request().postDataJSON();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await page
    .locator('.practice-sidebar')
    .getByRole('button', { name: '检查并提交', exact: true })
    .click();
  await page.getByRole('button', { name: '确认提交全部答案', exact: true }).click();
  await page.getByRole('button', { name: '使用原答案重试提交', exact: true }).waitFor();
  assert.equal(await page.locator('.answer-option input').first().isDisabled(), true);
  const retryResponse = page.waitForResponse(
    (response) => response.url().endsWith('/submit') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '使用原答案重试提交', exact: true }).click();
  assert.deepEqual((await retryResponse).request().postDataJSON(), originalPayload);
  await page.waitForURL('**/results/**');
  check('提交前断网锁定原答案并以相同请求重试');
  await page.goto(`${origin}/history`);
  await page.locator('tbody tr').nth(3).waitFor();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/login');
  await login(username, password);
  await page.goto(`${origin}/history`);
  await page.locator('tbody tr').nth(3).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 4);
  check('退出、重新登录后本人的开发服务记录仍在');

  await page.route('**/api/development/me/submissions?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        data: null,
        error: { code: 'SERVICE_UNAVAILABLE', message: '暂时无法读取记录，请稍后重试。' },
      }),
    }),
  );
  await page.reload();
  await visibleText('暂时无法读取记录，请稍后重试。');
  assert.equal(await page.getByText('还没有提交记录', { exact: true }).count(), 0);
  await page.unroute('**/api/development/me/submissions?*');
  await page.getByRole('button', { name: '重新尝试', exact: true }).click();
  await page.locator('tbody tr').nth(3).waitFor();
  check('503 与空记录分别处理，重试恢复');

  for (let i = 0; i < 8; i++) {
    const response = await context.request.post(`${origin}/api/development/practices`, {
      data: { mode: 'EXPLICIT', questionIds: ['Q01'] },
    });
    const practice = (await response.json()).data;
    await context.request.post(`${origin}/api/development/practices/${practice.id}/submit`, {
      data: { answers: [{ practiceItemId: practice.items[0].id, answer: answers.get('Q01') }] },
    });
  }
  await page.reload();
  await page.locator('tbody tr').nth(9).waitFor();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByText('第 2 页 / 共 2 页', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 2);
  await page.getByRole('button', { name: '上一页', exact: true }).click();
  await page.locator('tbody tr').nth(9).waitFor();
  check('历史按服务端 total 分页，第二页与返回第一页正确');

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on('pageerror', (error) => errors.push(error.message));
  await login(username, password, mobilePage);
  assert.ok(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  await screenshot('09-手机知识目录', mobilePage);
  await mobilePage.getByRole('button', { name: '打开导航', exact: true }).click();
  await mobilePage
    .locator('.sidebar')
    .getByRole('link', { name: /自主练习/ })
    .click();
  await mobilePage.getByRole('radio', { name: /指定题号/ }).check();
  await mobilePage.getByLabel('题号', { exact: true }).fill('Q24');
  await mobilePage.getByRole('button', { name: '创建并开始练习' }).click();
  await mobilePage.waitForURL('**/practice/**');
  await mobilePage.locator('.written-part textarea').nth(2).waitFor();
  assert.ok(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  await screenshot('10-手机三问作答', mobilePage);
  await fillQuestion({ question: { id: 'Q24' } }, answers.get('Q24'), mobilePage);
  await submitCurrent(mobilePage);
  await mobilePage.locator('.result-score').getByText('待复核', { exact: true }).waitFor();
  await mobilePage.goto(`${origin}/practice/new`);
  await mobilePage.getByRole('radio', { name: /指定题号/ }).check();
  await mobilePage.getByLabel('题号', { exact: true }).fill('Q01');
  await mobilePage.getByRole('button', { name: '创建并开始练习' }).click();
  await mobilePage.waitForURL('**/practice/**');
  await mobilePage.locator('.answer-option input[value="C"]').check();
  await mobilePage.route(
    '**/api/development/practices/*/submit',
    (route) => route.abort('failed'),
    { times: 1 },
  );
  await mobilePage
    .locator('.practice-sidebar')
    .getByRole('button', { name: '检查并提交', exact: true })
    .click();
  await mobilePage.getByRole('button', { name: '确认提交全部答案', exact: true }).click();
  await mobilePage.getByRole('button', { name: '使用原答案重试提交', exact: true }).waitFor();
  await mobilePage.getByRole('button', { name: '使用原答案重试提交', exact: true }).click();
  await mobilePage.waitForURL('**/results/**');
  await mobile.close();
  check('390px 窄屏目录、导航与三问输入无横向溢出，手机提交与断网重试可操作');

  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/login');
  await page.getByRole('link', { name: '创建学生账号', exact: true }).click();
  await page.waitForURL('**/register');
  await page.getByRole('heading', { name: '注册学生账号', exact: true }).waitFor();
  await page.getByLabel('用户名', { exact: true }).fill(`other_${Date.now().toString(36)}`);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '注册账号', exact: true }).click();
  await page.waitForURL('**/login?registered=1&username=*');
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '进入学习空间', exact: true }).click();
  await page.waitForURL('**/learn');
  await page.goto(`${origin}/history`);
  await visibleText('还没有提交记录');
  await page.goto(originalResultURL);
  await visibleText('没有找到可访问的资源。');
  check('另一账号看不到前一账号的记录或结果');
  assert.equal(
    await page
      .locator('body')
      .innerText()
      .then((text) => text.includes('展示')),
    false,
  );
  assert.deepEqual(errors, []);
  check('无页面脚本异常，无禁用界面文案');
  if (output)
    writeFileSync(
      path.join(output, 'browser-results.json'),
      JSON.stringify({ checks, errors, passed: true }, null, 2),
    );
} catch (error) {
  await screenshot('failure');
  if (output)
    writeFileSync(
      path.join(output, 'browser-results.json'),
      JSON.stringify({ checks, errors, passed: false, error: String(error) }, null, 2),
    );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
