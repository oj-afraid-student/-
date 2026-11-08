// Li Zihe: real auth/practice/database browser acceptance; requires an isolated local test DB.
// Knowledge routes and production content remain Zhao Jingyan's handoff. No product fixtures enabled.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const connection = process.env.ZHIXU_FRONTEND_TEST_DATABASE_URL;
if (!connection)
  throw new Error(
    'Set ZHIXU_FRONTEND_TEST_DATABASE_URL to an isolated local PostgreSQL test database.',
  );
const db = new URL(connection);
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(db.hostname),
  'Only local acceptance databases are allowed.',
);
const schema = 'frontend_test_' + randomBytes(6).toString('hex');
const scoped = new URL(connection);
scoped.searchParams.set('options', '-csearch_path=' + schema + ',public');
const admin = new pg.Pool({ connectionString: connection });
const pool = new pg.Pool({ connectionString: scoped.href });
const port = +(process.env.ZHIXU_FRONTEND_TEST_PORT ?? 4318);
const origin = 'http://127.0.0.1:' + port;
const read = async (file) =>
  JSON.parse(await readFile(new URL('../' + file, import.meta.url), 'utf8'));
const bank = await read('fixtures/server/question-bank.json');
const examples = (await read('fixtures/api/practice/result-response.json')).data;
const answers = new Map(examples.items.map((item) => [item.question.id, item.answer]));
const output = process.env.ZHIXU_QA_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const { chromium } = await import(
  process.env.ZHIXU_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.ZHIXU_PLAYWRIGHT_MODULE).href
    : 'playwright'
);
let app,
  browser,
  page,
  mobilePage,
  log = '';
const checks = [],
  errors = [];
const check = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};
async function shot(name, target = page) {
  if (output && target && !target.isClosed()) {
    await target.evaluate(() => window.scrollTo(0, 0));
    await target.screenshot({
      path: path.join(output, name + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
  }
}
async function start() {
  app = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        DATABASE_URL: scoped.href,
        ZHIXU_DEV_FIXTURES: '0',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  app.stdout.on('data', (chunk) => {
    log = (log + chunk).slice(-15000);
  });
  app.stderr.on('data', (chunk) => {
    log = (log + chunk).slice(-15000);
  });
  for (let i = 0; i < 150; i++) {
    if (app.exitCode !== null) throw new Error('Application exited: ' + log);
    try {
      if ((await fetch(origin + '/api/v1/health')).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Application did not become ready: ' + log);
}
async function stop() {
  if (!app || app.exitCode !== null) return;
  const exited = once(app, 'exit');
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
  else app.kill('SIGTERM');
  await exited;
}
async function signIn(target, username, password, navigate = true) {
  if (navigate) await target.goto(origin + '/login');
  await target.getByLabel('用户名', { exact: true }).fill(username);
  await target.getByLabel('密码', { exact: true }).fill(password);
  await target.getByRole('button', { name: '进入学习空间', exact: true }).click();
  await target.waitForURL((url) => !url.pathname.startsWith('/login'));
  await target.locator('.user-card strong').filter({ hasText: username }).waitFor();
}
async function register(target, username, password) {
  await target.goto(origin + '/register');
  await target.getByLabel('用户名', { exact: true }).fill(username);
  await target.getByLabel('密码', { exact: true }).fill(password);
  await target.getByLabel('确认密码', { exact: true }).fill(password);
  await target.getByRole('button', { name: '注册账号', exact: true }).click();
  await target.waitForURL(
    (url) => url.pathname === '/login' && url.searchParams.get('registered') === '1',
  );
  await target.getByText('注册成功，请使用新账号登录。', { exact: true }).waitFor();
}
async function create(target, mode = 'ALL', ids = '') {
  await target.goto(origin + '/practice/new');
  if (mode === 'EXPLICIT') {
    await target.getByRole('radio', { name: /指定题号/ }).check();
    await target.getByLabel('题号', { exact: true }).fill(ids);
  }
  const response = target.waitForResponse(
    (response) =>
      response.url() === origin + '/api/v1/practices' && response.request().method() === 'POST',
  );
  await target.getByRole('button', { name: '创建并开始练习' }).click();
  const result = await response;
  assert.equal(result.status(), 201);
  const practice = (await result.json()).data;
  await target.waitForURL('**/practice/' + practice.id);
  await target.locator('.question-title').waitFor();
  return practice;
}
async function fill(target, item, answer) {
  const panel = target.locator('.question-panel');
  await panel.locator('.question-meta .code-label').filter({ hasText: item.question.id }).waitFor();
  if (answer.type === 'SINGLE_CHOICE')
    await panel.locator('.answer-option input[value="' + answer.selectedOptionId + '"]').check();
  else if (answer.type === 'MULTIPLE_CHOICE')
    for (const id of answer.selectedOptionIds)
      await panel.locator('.answer-option input[value="' + id + '"]').check();
  else if (answer.type === 'FILL_BLANK') {
    const values = answer.blanks.flatMap((blank) => blank.values);
    const fields = panel.locator('.blank-value input');
    assert.equal(await fields.count(), values.length);
    for (let i = 0; i < values.length; i++) await fields.nth(i).fill(values[i]);
  } else if (answer.type === 'JUDGMENT_REASON') {
    for (let i = 0; i < answer.judgments.length; i++) {
      const field = panel.locator('.written-part').nth(i),
        entry = answer.judgments[i];
      await field.getByLabel(entry.value ? '正确' : '错误', { exact: true }).check();
      await field.locator('textarea').fill(entry.reason);
    }
  } else {
    const fields = panel.locator('.written-part textarea');
    assert.equal(await fields.count(), answer.parts.length);
    for (let i = 0; i < answer.parts.length; i++) await fields.nth(i).fill(answer.parts[i].text);
  }
}
async function confirm(target) {
  await target
    .locator('.practice-sidebar')
    .getByRole('button', { name: '检查并提交', exact: true })
    .click();
  await target.getByRole('button', { name: '确认提交全部答案', exact: true }).click();
}
async function result(target) {
  await target.waitForURL('**/results/**');
  await target.locator('.result-hero').waitFor();
}
async function api(context, url, method = 'GET', body) {
  // Use the browser cookie jar, including Secure cookies on the trusted loopback origin.
  return context.pages()[0].evaluate(
    async ({ url, method, body }) => {
      const response = await fetch('/api/v1' + url, {
        method,
        credentials: 'same-origin',
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      return { status: response.status, ...(await response.json()) };
    },
    { url, method, body },
  );
}
try {
  await admin.query('CREATE SCHEMA ' + schema);
  for (const name of ['001_initial.sql', '002_practice_v2.sql'])
    await pool.query(await readFile(new URL('../db/migrations/' + name, import.meta.url), 'utf8'));
  for (const record of bank)
    await pool.query(
      'INSERT INTO question_version (question_key,version,public_question,reference_answer,grading,source,is_published) VALUES ($1,$2,$3,$4,$5,$6,true)',
      [
        record.question.id,
        record.question.version,
        record.question,
        record.reference,
        record.grading,
        record.source,
      ],
    );
  await start();
  browser = await chromium.launch({
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
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const suffix = randomBytes(4).toString('hex'),
    username = 'li_' + suffix,
    password = 'frontend-password-123';
  await register(page, username, password);
  assert.equal((await api(context, '/auth/me')).status, 401);
  await signIn(page, username, password, false);
  assert.equal(await page.locator('.development-banner').count(), 0);
  check('关闭开发样例：真实注册不自动登录，真实 Cookie 登录成功');

  await page.goto(origin + '/practice/new');
  await page
    .getByText('暂时无法读取单元目录，仍可练习全部题目、按题型或难度筛选，或指定题号。', {
      exact: true,
    })
    .waitFor();
  await shot('01-真实选题-知识目录未接入');
  await page.getByRole('radio', { name: /按条件选题/ }).check();
  await page.getByLabel('单选题', { exact: true }).check();
  await page.getByLabel('多选题', { exact: true }).check();
  await page.getByLabel('题量（可选）', { exact: true }).fill('99');
  await page.getByRole('button', { name: '创建并开始练习' }).click();
  await page.getByText('匹配的题目只有 5 道，请减少题量。', { exact: true }).waitFor();
  await page.getByLabel('题量（可选）', { exact: true }).fill('5');
  const choicesResponse = page.waitForResponse(
    (response) =>
      response.url() === origin + '/api/v1/practices' && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '创建并开始练习' }).click();
  const choices = (await (await choicesResponse).json()).data;
  await page.waitForURL('**/practice/' + choices.id);
  for (let i = 0; i < choices.items.length; i++) {
    const item = choices.items[i],
      answer = structuredClone(answers.get(item.question.id));
    if (i >= 3) {
      const good = bank.find((record) => record.question.id === item.question.id).grading
        .correctOptionIds;
      const wrong = item.question.options.find((option) => !good.includes(option.id)).id;
      if (answer.type === 'SINGLE_CHOICE') answer.selectedOptionId = wrong;
      else answer.selectedOptionIds = [wrong];
    }
    await page.locator('.question-numbers button').nth(i).click();
    await fill(page, item, answer);
  }
  await confirm(page);
  await result(page);
  const choicesURL = page.url(),
    choicesId = choicesURL.split('/').pop();
  assert.match(await page.locator('.result-score').innerText(), /3\s*\/\s*5/);
  assert.equal(await page.locator('[aria-label="原题选项"]').count(), 5);
  await shot('02-真实判题-五题三分');
  await page.getByRole('button', { name: /^错误2$/ }).click();
  assert.equal(await page.locator('.result-item').count(), 2);
  await page.getByRole('button', { name: '重练本次错题', exact: true }).click();
  await page.waitForURL('**/practice/**');
  await page.locator('.question-title').waitFor();
  assert.equal(await page.locator('.question-numbers button').count(), 2);
  assert.notEqual(page.url().split('/').pop(), choices.id);
  assert.equal((await api(context, '/me/submissions/' + choicesId)).data.score, 3);
  check('目录故障不阻断选题；真实 FILTERED、题量409、五题3/5和错题新练习');

  const explicit = await create(page, 'EXPLICIT', 'Q24、Q06、Q14');
  assert.deepEqual(
    explicit.items.map((item) => item.question.id),
    ['Q24', 'Q06', 'Q14'],
  );
  await page.goto(origin + '/practice/new?unit=SG-01');
  const unitResponse = page.waitForResponse(
    (response) =>
      response.url() === origin + '/api/v1/practices' && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '创建并开始练习' }).click();
  assert.equal((await (await unitResponse).json()).data.totalCount, 6);
  check('EXPLICIT 保留题序，单元筛选按公开单元 ID 接入');

  const all = await create(page);
  assert.equal(all.totalCount, 24);
  await page
    .locator('.practice-sidebar')
    .getByRole('button', { name: '检查并提交', exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: '还有 24 题需要补全' }).waitFor();
  const types = new Set();
  const originalText = '  条件 Ａ　∥ Ｂ；保留内部空白。\n所以结论成立。  ';
  for (let i = 0; i < all.items.length; i++) {
    const item = all.items[i],
      answer = structuredClone(answers.get(item.question.id));
    if (item.question.id === 'Q14') answer.blanks[0].values.reverse();
    if (item.question.id === 'Q05')
      answer.judgments.forEach((entry) => {
        entry.value = false;
        entry.reason = '使用反例说明 Ａ 与 Ｂ 的关系。';
      });
    if (item.question.id === 'Q24') answer.parts[0].text = originalText;
    await page.locator('.question-numbers button').nth(i).click();
    await fill(page, item, answer);
    types.add(item.question.type);
    if (item.question.id === 'Q06') {
      await page.reload();
      await page.locator('.question-numbers button.answered').nth(5).waitFor();
    }
  }
  assert.equal(types.size, 8);
  assert.equal(await page.locator('.question-numbers button.answered').count(), 24);
  await shot('03-真实作答-三问');
  let originalPayload;
  await page.route(
    '**/api/v1/practices/*/submit',
    async (route) => {
      originalPayload = route.request().postDataJSON();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await confirm(page);
  await page.getByRole('button', { name: '使用原答案重试提交', exact: true }).waitFor();
  assert.equal(await page.locator('.written-part textarea').first().isDisabled(), true);
  await page.getByRole('button', { name: '重新查询提交状态', exact: true }).click();
  await page
    .getByText('当前练习尚未确认提交成功。原答案已保留，可使用原内容重试。', { exact: true })
    .waitFor();
  await page.reload();
  await page.getByRole('button', { name: '使用原答案重试提交', exact: true }).waitFor();
  assert.equal(
    (await pool.query('SELECT count(*) FROM submission WHERE practice_id=$1', [all.id])).rows[0]
      .count,
    '0',
  );
  const user = (await api(context, '/auth/me')).data;
  await pool.query("UPDATE app_session SET expires_at=now()-interval '1 second' WHERE user_id=$1", [
    user.id,
  ]);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForURL((url) => url.pathname === '/login' && !!url.searchParams.get('returnTo'));
  await signIn(page, username, password, false);
  await page.waitForURL('**/practice/' + all.id);
  await page.getByRole('button', { name: '使用原答案重试提交', exact: true }).waitFor();
  const retry = page.waitForResponse((response) =>
    response.url().endsWith('/' + all.id + '/submit'),
  );
  await page.getByRole('button', { name: '使用原答案重试提交', exact: true }).click();
  assert.deepEqual((await retry).request().postDataJSON(), originalPayload);
  await result(page);
  const allURL = page.url(),
    allId = allURL.split('/').pop();
  const detail = (await api(context, '/me/submissions/' + allId)).data;
  assert.equal(detail.gradedCount, 11);
  assert.equal(detail.pendingCount, 13);
  assert.equal(detail.score, null);
  assert.equal(
    detail.items.find((item) => item.question.id === 'Q24').answer.parts[0].text,
    originalText.trim(),
  );
  assert.equal(
    detail.items.find((item) => item.question.id === 'Q05').answer.judgments[0].value,
    false,
  );
  assert.equal(
    (await pool.query('SELECT count(*) FROM submission WHERE practice_id=$1', [all.id])).rows[0]
      .count,
    '1',
  );
  await page.getByRole('button', { name: /^待复核13$/ }).click();
  assert.equal(await page.locator('.result-item').count(), 13);
  assert.ok(await page.locator('[aria-label="原题分问"]').count());
  await shot('04-真实结果-待复核');
  check('24题八题型、多空多值与false；立即刷新、断网、锁定快照、会话失效重登和同一内容重试');
  check('真实数据库保存原文与三态，待复核不转零分；结果保留原选项、分问和版本');

  const lost = await create(page, 'EXPLICIT', 'Q01');
  await fill(page, lost.items[0], answers.get('Q01'));
  await page.route(
    '**/api/v1/practices/*/submit',
    async (route) => {
      await route.fetch();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await confirm(page);
  await result(page);
  assert.equal(
    (await pool.query('SELECT count(*) FROM submission WHERE practice_id=$1', [lost.id])).rows[0]
      .count,
    '1',
  );
  check('真实提交已保存但响应丢失，状态查询恢复唯一结果');

  const newer = structuredClone(bank[0]);
  newer.question.version = 2;
  newer.question.title += '（验收新版）';
  newer.question.options[0].text += '（新版选项）';
  newer.reference.explanation = '新版参考解析，仅在隔离测试库使用。';
  await pool.query(
    'INSERT INTO question_version (question_key,version,public_question,reference_answer,grading,source,is_published) VALUES ($1,2,$2,$3,$4,$5,true)',
    [newer.question.id, newer.question, newer.reference, newer.grading, newer.source],
  );
  await page.goto(choicesURL);
  await page.locator('.result-hero').waitFor();
  assert.equal(await page.getByText(newer.question.title, { exact: true }).count(), 0);
  await page.getByRole('button', { name: '再练同一题组', exact: true }).click();
  await page.waitForURL('**/practice/**');
  await page.getByRole('heading', { name: newer.question.title, exact: true }).waitFor();
  await pool.query("UPDATE question_version SET is_published=false WHERE question_key='Q01'");
  await page.goto(choicesURL);
  await page.locator('.result-hero').waitFor();
  const countBefore = (await pool.query('SELECT count(*) FROM practice')).rows[0].count;
  await page.getByRole('button', { name: '再练同一题组', exact: true }).click();
  await page
    .getByText('部分题目已不在可练习范围，暂时无法重新组题。原作答结果仍保留，请选择其他题目。', {
      exact: true,
    })
    .waitFor();
  assert.equal((await pool.query('SELECT count(*) FROM practice')).rows[0].count, countBefore);
  assert.equal(
    (await api(context, '/me/submissions/' + choicesId)).data.items[0].question.version,
    1,
  );
  await shot('05-真实结果-下架提示');
  await pool.query(
    "UPDATE question_version SET is_published=true WHERE question_key='Q01' AND version=1",
  );
  check('重练使用最新已发布版本；全部下架时明确404提示、不产生部分练习、旧结果保留');

  const unfinished = await create(page, 'EXPLICIT', 'Q24');
  await page.locator('.written-part textarea').first().fill('未提交的 Ａ　∥ Ｂ 推理草稿');
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        data: null,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'temporary' },
      }),
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: '重新确认登录状态', exact: true }).waitFor();
  assert.equal(
    await page.locator('.written-part textarea').first().inputValue(),
    '未提交的 Ａ　∥ Ｂ 推理草稿',
  );
  await page.unroute('**/api/v1/auth/me');
  await page.getByRole('button', { name: '重新确认登录状态', exact: true }).click();
  await page
    .getByRole('button', { name: '重新确认登录状态', exact: true })
    .waitFor({ state: 'hidden' });
  await page.evaluate(() =>
    localStorage.setItem('zhixu:draft:v2:another-user:example', 'untouched'),
  );
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/login');
  const savedKeys = await page.evaluate(() => Object.keys(localStorage));
  assert.ok(!savedKeys.some((key) => key.startsWith('zhixu:draft:v2:' + user.id + ':')));
  assert.ok(savedKeys.includes('zhixu:draft:v2:another-user:example'));
  await signIn(page, username, password);
  check('后台确认登录503不卸载作答；主动退出只清理本人草稿，真实重登有效');

  const second = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
  });
  const pageB = await second.newPage();
  pageB.on('pageerror', (error) => errors.push(error.message));
  await register(pageB, 'other_' + suffix, password);
  await signIn(pageB, 'other_' + suffix, password, false);
  await pageB.goto(allURL);
  await pageB.getByText('没有找到可访问的资源。', { exact: true }).waitFor();
  assert.equal(await pageB.locator('.answer-review').count(), 0);
  assert.equal(
    (await api(second, '/practices/' + all.id + '/submit', 'POST', originalPayload)).status,
    404,
  );
  await pageB.goto(origin + '/history');
  await pageB.getByText('还没有提交记录', { exact: true }).waitFor();
  await second.close();
  check('第二真实账号无法读取或提交他人的练习、结果与历史');

  await page.goto(allURL);
  await page.locator('.answer-review').first().waitFor();
  assert.equal(
    (await api(context, '/auth/login', 'POST', { username: 'other_' + suffix, password })).status,
    200,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page
    .locator('.user-card strong')
    .filter({ hasText: 'other_' + suffix })
    .waitFor();
  await page.getByText('没有找到可访问的资源。', { exact: true }).waitFor();
  assert.equal(await page.locator('.answer-review').count(), 0);
  await signIn(page, username, password);
  check('同一浏览器 Cookie 用户变化后重新挂载受保护页面，不沿用前账号结果缓存');

  for (let i = 0; i < 10; i++) {
    const p = (await api(context, '/practices', 'POST', { mode: 'EXPLICIT', questionIds: ['Q01'] }))
      .data;
    const submitted = await api(context, '/practices/' + p.id + '/submit', 'POST', {
      answers: [{ practiceItemId: p.items[0].id, answer: answers.get('Q01') }],
    });
    assert.equal(submitted.status, 201);
  }
  await page.goto(origin + '/history');
  await page.locator('tbody tr').nth(9).waitFor();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByText(/第 2 页/).waitFor();
  await page.locator('tbody tr').first().waitFor();
  await shot('06-真实历史-分页');
  check('已有历史页面接真实分页与同一 submissionId，OPEN 草稿不计入记录');

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  mobilePage = await mobile.newPage();
  mobilePage.on('pageerror', (error) => errors.push(error.message));
  await signIn(mobilePage, username, password);
  const pMobile = await create(mobilePage, 'EXPLICIT', 'Q24');
  await fill(mobilePage, pMobile.items[0], answers.get('Q24'));
  assert.ok(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  );
  await shot('07-手机真实三问', mobilePage);
  await mobilePage.route(
    '**/api/v1/practices/*/submit',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          data: null,
          error: { code: 'SERVICE_UNAVAILABLE', message: '保存暂不可用。' },
        }),
      }),
    { times: 1 },
  );
  await confirm(mobilePage);
  await mobilePage.getByRole('button', { name: '使用原答案重试提交', exact: true }).click();
  await result(mobilePage);
  assert.ok(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  );
  await shot('08-手机真实结果', mobilePage);
  await mobile.close();
  mobilePage = null;
  check('390px 手机三问输入、503原答案重试、待复核结果与布局通过');

  await stop();
  await start();
  await page.goto(allURL);
  await page.locator('.result-hero').waitFor();
  assert.deepEqual((await api(context, '/me/submissions/' + allId)).data, detail);
  await page.goto(origin + '/practice/' + unfinished.id);
  await page.locator('.written-part textarea').first().waitFor();
  assert.equal(await page.locator('.written-part textarea').first().inputValue(), '');
  check('应用重启后真实会话、原答卷与结果保持；主动退出已清理本机未提交草稿');
  assert.deepEqual(errors, []);
  assert.ok(!(await page.locator('body').innerText()).includes('展示'));
  check('真实接口模式无样例回退、无脚本异常、无禁用界面文案');
  if (output)
    await writeFile(
      path.join(output, 'real-browser-results.json'),
      JSON.stringify(
        {
          base: 'cfede3e',
          database: 'PostgreSQL 17.11; isolated temporary schema',
          knowledge: 'No knowledge endpoints implemented or intercepted',
          checks,
          errors,
          passed: true,
        },
        null,
        2,
      ),
    );
} catch (error) {
  await shot('failure-real');
  await shot('failure-mobile', mobilePage);
  if (output)
    await writeFile(
      path.join(output, 'real-browser-results.json'),
      JSON.stringify(
        { checks, errors, passed: false, error: String(error), serverLog: log },
        null,
        2,
      ),
    );
  throw error;
} finally {
  if (browser) await browser.close();
  await stop();
  await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
  await admin.end();
}
