import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from '../scripts/lib/migrations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = path.join(root, 'db/migrations');
const seed = await readFile(path.join(root, 'db/seed.sql'), 'utf8');
let db;
let initialOnlyDir;

// PGlite 使用 PostgreSQL 引擎，在测试中无需启动本地数据库服务。
function adapter(database) {
  return {
    async query(sql, params) {
      if (!params && sql.includes(';')) {
        await database.exec(sql);
        return { rows: [] };
      }
      return database.query(sql, params);
    },
  };
}

// 这些用例保留对 001 的验证。002 与升级路径由 database-v2.test.mjs 验证。
before(async () => {
  initialOnlyDir = await mkdtemp(path.join(os.tmpdir(), 'zhixu-001-'));
  await writeFile(
    path.join(initialOnlyDir, '001_initial.sql'),
    await readFile(path.join(migrationDir, '001_initial.sql')),
  );
  db = new PGlite();
  await applyMigrations(adapter(db), initialOnlyDir);
  await db.exec(seed);
});
after(async () => {
  await db?.close();
  if (initialOnlyDir) await rm(initialOnlyDir, { recursive: true, force: true });
});

async function question(overrides = {}) {
  const value = {
    key: `test-${randomUUID()}`,
    options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: `测试选项 ${id}` })),
    correct: 'A',
    ...overrides,
  };
  const { rows } = await db.query(
    `INSERT INTO question_version
      (question_key, version, knowledge_point_id, stem, options, correct_option_id, explanation, is_published)
      VALUES ($1, 1, 'SG-01', '仅用于数据库约束测试', $2, $3, $4, true) RETURNING id`,
    [
      value.key,
      JSON.stringify(value.options),
      value.correct,
      JSON.stringify({ steps: ['测试解析'] }),
    ],
  );
  return rows[0].id;
}

async function practice() {
  const { rows: users } = await db.query(
    'INSERT INTO app_user (username, password_hash) VALUES ($1, $2) RETURNING id',
    [`t_${randomUUID().replaceAll('-', '').slice(0, 16)}`, 'test-only-hash'],
  );
  const { rows } = await db.query(
    `INSERT INTO practice (user_id, knowledge_point_id) VALUES ($1, 'SG-01') RETURNING id`,
    [users[0].id],
  );
  return rows[0].id;
}

test('迁移与种子可重复执行，种子仅创建三个单元', async () => {
  assert.deepEqual(await applyMigrations(adapter(db), initialOnlyDir), []);
  await db.exec(seed);
  const { rows } = await db.query('SELECT id FROM knowledge_point ORDER BY sort_order');
  assert.deepEqual(
    rows.map((row) => row.id),
    ['SG-01', 'SG-02', 'SG-03'],
  );
  const { rows: counts } = await db.query('SELECT count(*)::int AS n FROM question_version');
  assert.equal(counts[0].n, 0);
});

test('题目拒绝重复选项和不存在的正确选项', async () => {
  await assert.rejects(question({ correct: 'X' }), /check constraint/);
  await assert.rejects(
    question({ options: ['A', 'A', 'C', 'D'].map((id) => ({ id, text: id })) }),
    /check constraint/,
  );
});

test('已发布题目内容不可覆盖，必须新增版本', async () => {
  const id = await question();
  await assert.rejects(
    db.query('UPDATE question_version SET stem = $1 WHERE id = $2', ['覆盖旧题', id]),
    /immutable/,
  );
  await db.query('UPDATE question_version SET is_published = false WHERE id = $1', [id]);
  await assert.rejects(
    db.query('UPDATE question_version SET stem = $1 WHERE id = $2', ['取消发布后覆盖', id]),
    /immutable/,
  );
  const { rows } = await db.query('SELECT stem FROM question_version WHERE id = $1', [id]);
  assert.equal(rows[0].stem, '仅用于数据库约束测试');
});

test('同一次练习只允许一个最终提交，非法状态被拒绝', async () => {
  const id = await practice();
  await db.query('INSERT INTO submission (practice_id, correct_count) VALUES ($1, 3)', [id]);
  await assert.rejects(
    db.query('INSERT INTO submission (practice_id, correct_count) VALUES ($1, 4)', [id]),
    /unique constraint/,
  );
  await assert.rejects(
    db.query('UPDATE practice SET status = $1 WHERE id = $2', ['UNKNOWN', id]),
    /check constraint/,
  );
});

test('作答不能引用另一份练习的题项', async () => {
  const a = await practice();
  const b = await practice();
  const q = await question();
  const { rows: items } = await db.query(
    'INSERT INTO practice_item (practice_id, question_version_id, position) VALUES ($1, $2, 1) RETURNING id',
    [b, q],
  );
  const { rows: submissions } = await db.query(
    'INSERT INTO submission (practice_id, correct_count) VALUES ($1, 0) RETURNING id',
    [a],
  );
  await assert.rejects(
    db.query(
      `INSERT INTO submission_answer
        (submission_id, practice_id, practice_item_id, selected_option_id, is_correct)
        VALUES ($1, $2, $3, 'A', false)`,
      [submissions[0].id, a, items[0].id],
    ),
    /foreign key constraint/,
  );
});

test('修改已执行迁移会被识别', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zhixu-drift-'));
  try {
    const sql = await readFile(path.join(migrationDir, '001_initial.sql'), 'utf8');
    await writeFile(path.join(dir, '001_initial.sql'), sql + '\n-- changed\n');
    await assert.rejects(applyMigrations(adapter(db), dir), /Applied migration changed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('失败迁移整体回滚，不留下半套结构', async () => {
  const tempDb = new PGlite();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zhixu-rollback-'));
  try {
    await writeFile(path.join(dir, '001.sql'), 'CREATE TABLE rollback_probe (id integer);');
    await writeFile(path.join(dir, '002.sql'), 'SELECT * FROM missing_table;');
    await assert.rejects(applyMigrations(adapter(tempDb), dir), /does not exist/);
    const { rows } = await tempDb.query("SELECT to_regclass('public.rollback_probe') AS name");
    assert.equal(rows[0].name, null);
  } finally {
    await tempDb.close();
    await rm(dir, { recursive: true, force: true });
  }
});
