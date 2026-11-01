/** 用实际 JSON 字面量进行严格类型检查，避免 JSON 导入将判别字段扩大为 string。 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const directory = mkdtempSync(join(tmpdir(), 'zhixu-contract-types-'));
const shared = fileURLToPath(new URL('src/shared/contracts/index', root));
const server = fileURLToPath(new URL('src/server/practice/contracts', root));
let source = `import type * as C from ${JSON.stringify(shared)};\nimport type { QuestionVersionRecord } from ${JSON.stringify(server)};\n`;
let count = 0;
function check(value, type) {
  source += `const sample${count++} = ${JSON.stringify(value)} satisfies ${type};\n`;
}
check(read('fixtures/content/questions.json'), 'C.PublicQuestion[]');
check(read('fixtures/content/knowledge-units.json'), 'C.KnowledgeDetail[]');
check(read('fixtures/server/question-bank.json'), 'QuestionVersionRecord[]');
check(read('fixtures/api/practice/submit-request.json'), 'C.SubmitPracticeRequest');
check(read('fixtures/api/practice/result-response.json'), 'C.ApiResponse<C.SubmissionDetail>');
check(read('fixtures/api/practice/submitted-response.json'), 'C.ApiResponse<C.Practice>');
check(read('fixtures/api/practice/history-empty-response.json'), 'C.ApiResponse<C.HistoryPage>');
const keys = [
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/logout',
  'GET /auth/me',
  'GET /knowledge-points',
  'GET /knowledge-points/:id',
  'POST /practices',
  'GET /practices/:id',
  'POST /practices/:id/submit',
  'GET /me/submissions',
  'GET /me/submissions/:id',
];
for (const [i, scenario] of read('fixtures/api/scenarios.json').entries()) {
  check(scenario.response, `C.BusinessEndpoints[${JSON.stringify(keys[i])}]['response']`);
  check(
    i === 9 ? { page: 1, pageSize: 20 } : scenario.request,
    `C.BusinessEndpoints[${JSON.stringify(keys[i])}]['request']`,
  );
}
for (const e of read('fixtures/api/errors.json')) check(e.response, 'C.ApiResponse<never>');
const input = join(directory, 'fixtures.ts');
writeFileSync(input, source);
try {
  const compiler =
    process.argv[2] ?? fileURLToPath(new URL('node_modules/typescript/bin/tsc', root));
  const result = spawnSync(
    process.execPath,
    [
      compiler,
      '--strict',
      '--noEmit',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      input,
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (result.status === 0) console.log(`${count} 个实际 JSON 样例通过 TypeScript 严格类型检查。`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
