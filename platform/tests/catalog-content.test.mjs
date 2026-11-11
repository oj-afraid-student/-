import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { importContent, readContentRelease } from '../scripts/lib/content.mjs';

test('正式内容可从 002 空库导入和重跑，版本冲突不留下半次发布', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const sql = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
  for (const name of ['001_initial.sql', '002_practice_v2.sql']) {
    await db.exec(await sql('db/migrations/' + name));
  }
  await db.exec(await sql('db/seed.sql'));

  const release = readContentRelease();
  const summary = { units: 6, questions: 24 };
  assert.deepEqual(await importContent(db, release), summary);
  const { rows: first } = await db.query(
    'SELECT id, question_key, version, is_published FROM question_version ORDER BY question_key',
  );
  assert.equal(first.length, 24);
  assert.ok(first.every(({ is_published }) => is_published));
  assert.deepEqual(await importContent(db, release), summary);
  assert.deepEqual(
    (
      await db.query(
        'SELECT id, question_key, version, is_published FROM question_version ORDER BY question_key',
      )
    ).rows,
    first,
  );
  const { rows: knowledge } = await db.query(
    "SELECT count(*)::int AS units, sum(jsonb_array_length(content->'sections'))::int AS sections FROM knowledge_point",
  );
  assert.deepEqual(knowledge, [{ units: 6, sections: 15 }]);

  const modified = structuredClone(release);
  modified.units[0].title = '用于验证回滚的标题';
  modified.bank[0].question.version = 2;
  modified.bank.at(-1).reference.explanation = '与现有版本冲突的解析';
  await assert.rejects(() => importContent(db, modified), /Q24 v1 已有不同内容/);
  assert.deepEqual((await db.query("SELECT title FROM knowledge_point WHERE id='SG-01'")).rows, [
    { title: release.units[0].title },
  ]);
  assert.equal((await db.query('SELECT 1 FROM question_version WHERE version = 2')).rows.length, 0);

  const invalid = structuredClone(release);
  invalid.bank[0].question.knowledgeIds.push('unknown');
  await assert.rejects(() => importContent(db, invalid), /题目与所属单元、知识点不一致：Q01/);
});
