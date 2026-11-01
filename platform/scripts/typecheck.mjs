import { spawnSync } from 'node:child_process';

for (const args of [
  ['exec', 'next', 'typegen'],
  ['exec', 'tsc', '--noEmit'],
]) {
  const result = spawnSync('pnpm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
