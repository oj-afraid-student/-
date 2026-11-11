import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { importContent, readContentRelease } from './lib/content.mjs';
import { applyMigrations } from './lib/migrations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const file = path.join(root, name);
  if (existsSync(file)) process.loadEnvFile(file);
}

const command = process.argv[2];
if (!['check', 'migrate', 'seed', 'import-content'].includes(command)) {
  console.error('Usage: node scripts/db.mjs check|migrate|seed|import-content');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 未配置。请填写 platform/.env.local；首页无需数据库即可启动。');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5_000,
});
let client;
try {
  client = await pool.connect();
  if (command === 'check') {
    const { rows } = await client.query('SELECT current_database() AS name, version() AS version');
    console.log(`数据库连接正常：${rows[0].name}`);
    console.log(rows[0].version);
  } else if (command === 'migrate') {
    const names = await applyMigrations(client, path.join(root, 'db/migrations'));
    console.log(names.length ? `已执行迁移：${names.join(', ')}` : '迁移已是最新。');
  } else if (command === 'import-content') {
    const { units, questions } = await importContent(client, readContentRelease());
    console.log('正式内容导入完成：' + units + ' 个知识单元，' + questions + ' 道已发布题目。');
  } else {
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(path.join(root, 'db/seed.sql'), 'utf8'));
      await client.query('COMMIT');
      console.log('三个单元元数据已准备。未创建题目、账号或作答记录。');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} catch (error) {
  console.error(`数据库操作失败：${error instanceof Error ? error.message : 'UnknownError'}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
