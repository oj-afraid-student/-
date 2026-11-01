import { spawnSync } from 'node:child_process';

for (const task of ['format:check', 'lint', 'typecheck', 'test', 'build']) {
  console.log(`\n[platform] ${task}`);
  const result = spawnSync('pnpm', [task], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
