import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(directory, entry.name))
      : [path.join(directory, entry.name)],
  );
}
const editable = ['src/features', 'src/shared']
  .flatMap((directory) => files(path.join(root, directory)))
  .filter((file) => /\.(ts|tsx)$/.test(file));
for (const file of editable) {
  const text = readFileSync(file, 'utf8');
  assert.ok(
    !/(?:from\s+|import\s*\()['"][^'"]*(?:fixtures\/server|@\/server)/.test(text),
    `前端导入服务端：${file}`,
  );
  assert.ok(!text.includes('展示'), `出现禁用界面文案：${file}`);
}
for (const file of files(path.join(root, 'src/app')).filter((file) => file.endsWith('.tsx')))
  assert.ok(!readFileSync(file, 'utf8').includes('展示'), `出现禁用界面文案：${file}`);
for (const name of ['questions', 'knowledge-units'])
  assert.ok(
    !readFileSync(path.join(root, `fixtures/content/${name}.json`), 'utf8').includes('展示'),
    `内容含禁用文案：${name}`,
  );
const chunks = path.join(root, '.next/static/chunks');
assert.ok(existsSync(chunks), '请先完成 pnpm build。');
const privateTokens = [
  'correctOptionIds',
  'acceptedValues',
  'CHOICE_SET',
  'ALIASES_OR_REVIEW',
  'fixture-only-password',
];
for (const file of files(chunks).filter((file) => file.endsWith('.js'))) {
  const text = readFileSync(file, 'utf8');
  for (const token of privateTokens)
    assert.ok(!text.includes(token), `客户端产物含私有题库字段 ${token}：${file}`);
}
const originalFiles = [
  'package.json',
  'pnpm-lock.yaml',
  'eslint.config.mjs',
  'src/shared/contracts/index.ts',
  'src/shared/contracts/learning.ts',
];
console.log('PASS 前端源文件与生产客户端包无私有题库字段、禁止导入或禁用文案。');
console.log(`另需在 Git 差异核对以下基线未发生语义修改：${originalFiles.join('、')}。`);
