import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  emptyAnswer,
  prepareSubmission,
  restoreAnswer,
  serializeAnswer,
  validateAnswer,
} from '../src/features/practice/answer-model.ts';
import { ApiClientError, request, safeReturnPath } from '../src/shared/api/client.ts';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const practice = read('../fixtures/api/practice/create-response.json').data;
const submitted = read('../fixtures/api/practice/submit-request.json');
const drafts = Object.fromEntries(
  submitted.answers.map((entry) => [entry.practiceItemId, entry.answer]),
);
const question = (id) => practice.items.find((item) => item.question.id === id).question;

test('24 题、八题型完整答案按契约序列化，practiceItemId 不被题号替代', () => {
  assert.equal(practice.items.length, 24);
  assert.equal(new Set(practice.items.map((item) => item.question.type)).size, 8);
  const ready = prepareSubmission(practice, drafts);
  assert.deepEqual(ready.issues, []);
  assert.equal(ready.payload.answers.length, 24);
  for (const item of practice.items) {
    assert.notEqual(item.id, item.question.id);
    const answer = ready.payload.answers.find((entry) => entry.practiceItemId === item.id).answer;
    assert.equal(answer.type, item.question.type);
    assert.deepEqual(validateAnswer(item.question, answer), []);
  }
});
test('每道题的初始答案均需补全，不把未答计为已完成', () => {
  for (const item of practice.items)
    assert.ok(
      validateAnswer(item.question, emptyAnswer(item.question)).length > 0,
      item.question.id,
    );
});
test('Q06 漏空、重复空与 Q14 少值均不能提交', () => {
  const q6 = question('Q06');
  const a6 = emptyAnswer(q6);
  a6.blanks[0].values[0] = 'AC';
  assert.equal(validateAnswer(q6, a6).length, 2);
  a6.blanks[1].blankId = a6.blanks[0].blankId;
  assert.ok(validateAnswer(q6, a6).length);
  const q14 = question('Q14');
  const a14 = emptyAnswer(q14);
  assert.equal(a14.blanks.length, 1);
  assert.equal(a14.blanks[0].values.length, 2);
  a14.blanks[0].values[0] = '1';
  assert.ok(validateAnswer(q14, a14).length);
});
test('Q24 三问分别保存、缺一问阻止提交', () => {
  const q = question('Q24');
  const answer = emptyAnswer(q);
  assert.equal(answer.parts.length, 3);
  answer.parts[0].text = '  第一问过程  ';
  answer.parts[1].text = '第二问过程';
  assert.equal(validateAnswer(q, answer).length, 1);
  answer.parts[2].text = '第三问过程';
  assert.equal(serializeAnswer(q, answer).parts[0].text, '第一问过程');
});
test('判断 false 是有效答案，仍必须提供每条判断的理由', () => {
  const q = question('Q05');
  const answer = emptyAnswer(q);
  for (const judgment of answer.judgments) {
    judgment.value = false;
    judgment.reason = '由反例说明。';
  }
  assert.deepEqual(validateAnswer(q, answer), []);
  assert.ok(serializeAnswer(q, answer).judgments.every((judgment) => judgment.value === false));
  answer.judgments[0].reason = '  ';
  assert.equal(validateAnswer(q, answer).length, 1);
});
test('无效选项、重复多选、错配题型及额外分问被拒绝', () => {
  assert.ok(
    validateAnswer(question('Q01'), { type: 'SINGLE_CHOICE', selectedOptionId: 'Z' }).length,
  );
  assert.ok(
    validateAnswer(question('Q03'), { type: 'MULTIPLE_CHOICE', selectedOptionIds: ['A', 'A'] })
      .length,
  );
  assert.ok(
    validateAnswer(question('Q01'), { type: 'MULTIPLE_CHOICE', selectedOptionIds: ['A'] }).length,
  );
  const q = question('Q24'),
    answer = emptyAnswer(q);
  answer.parts.forEach((part) => (part.text = '过程'));
  answer.parts.push({ partId: 'extra', text: '额外' });
  assert.ok(validateAnswer(q, answer).length);
});
test('浏览器草稿按当前模式重建，不信任旧字段、未知选项或多余分问', () => {
  assert.deepEqual(
    restoreAnswer(question('Q03'), {
      type: 'MULTIPLE_CHOICE',
      selectedOptionIds: ['A', 'A', 'X'],
      reference: '泄露',
    }),
    { type: 'MULTIPLE_CHOICE', selectedOptionIds: ['A'] },
  );
  const q = question('Q24');
  assert.deepEqual(
    restoreAnswer(q, { type: 'PROOF', parts: [{ partId: 'p1', text: '错误题型' }] }),
    emptyAnswer(q),
  );
  assert.deepEqual(restoreAnswer(question('Q01'), '<script>'), emptyAnswer(question('Q01')));
});
test('答案字符上限及整个请求 UTF-8 字节上限独立校验', () => {
  const q2 = question('Q02'),
    answer = emptyAnswer(q2);
  answer.blanks[0].values[0] = 'a'.repeat(201);
  assert.ok(validateAnswer(q2, answer).length);
  const proof = practice.items.find((item) => item.question.type === 'PROOF');
  const large = {
    ...practice,
    totalCount: 100,
    items: Array.from({ length: 100 }, (_, i) => ({ ...proof, id: `item-${i}`, position: i + 1 })),
  };
  const largeDrafts = Object.fromEntries(
    large.items.map((item) => {
      const answer = emptyAnswer(item.question);
      answer.parts.forEach((part) => (part.text = '中'.repeat(10000)));
      return [item.id, answer];
    }),
  );
  const ready = prepareSubmission(large, largeDrafts);
  assert.equal(ready.payload, null);
  assert.match(ready.issues[0].message, /1 MiB/);
});
test('未答定位关联实际题项和顺序，允许不是五题的练习', () => {
  const three = { ...practice, totalCount: 3, items: practice.items.slice(0, 3) };
  assert.equal(prepareSubmission(three, drafts).payload.answers.length, 3);
  const broken = structuredClone(drafts);
  broken[three.items[1].id] = emptyAnswer(three.items[1].question);
  const ready = prepareSubmission(three, broken);
  assert.equal(ready.issues[0].itemId, three.items[1].id);
  assert.equal(ready.issues[0].position, 2);
});
test('登录返回地址拒绝外域、双斜线、反斜线与控制字符', () => {
  for (const path of [
    'https://example.org',
    '//example.org',
    '/\\example.org',
    'javascript:alert(1)',
    '/learn\n//example.org',
    null,
  ])
    assert.equal(safeReturnPath(path), '/learn');
  assert.equal(safeReturnPath('/practice/my-id'), '/practice/my-id');
  assert.equal(safeReturnPath('/history?page=2'), '/history?page=2');
});
test('统一请求保持 Cookie、GET/退出无 JSON body，POST 精确封装', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: { success: true }, error: null });
  };
  try {
    await request('/api/v1', '/auth/me');
    await request('/api/v1', '/auth/logout', { method: 'POST' });
    await request('/api/v1', '/auth/login', {
      method: 'POST',
      body: { username: 'student', password: ' pass word ' },
    });
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.ok(!('body' in calls[0].options));
    assert.ok(!('body' in calls[1].options));
    assert.deepEqual(JSON.parse(calls[2].options.body), {
      username: 'student',
      password: ' pass word ',
    });
  } finally {
    globalThis.fetch = original;
  }
});
test('401/409/501/503、非 JSON 与网络中断均明确抛错，不回退样例', async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, code] of [
      [401, 'UNAUTHENTICATED'],
      [409, 'CONFLICT'],
      [501, 'NOT_IMPLEMENTED'],
      [503, 'SERVICE_UNAVAILABLE'],
    ]) {
      globalThis.fetch = async () =>
        Response.json({ data: null, error: { code, message: '业务错误' } }, { status });
      await assert.rejects(
        request('/api/v1', '/resource'),
        (error) =>
          error instanceof ApiClientError && error.status === status && error.code === code,
      );
    }
    globalThis.fetch = async () => new Response('<html>404</html>', { status: 404 });
    await assert.rejects(
      request('/api/v1', '/resource'),
      (error) => error.code === 'INVALID_RESPONSE',
    );
    globalThis.fetch = async () => {
      throw new TypeError('offline');
    };
    await assert.rejects(
      request('/api/v1', '/resource'),
      (error) => error.code === 'NETWORK_ERROR',
    );
  } finally {
    globalThis.fetch = original;
  }
});
