import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function applyMigrations(client, directory) {
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  const applied = [];
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(2026110101)');
    await client.query(`CREATE TABLE IF NOT EXISTS platform_schema_migration (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT name, checksum FROM platform_schema_migration');
    const previous = new Map(rows.map((row) => [row.name, row.checksum]));
    for (const name of files) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (previous.has(name)) {
        if (previous.get(name) !== checksum) {
          throw new Error(`Applied migration changed: ${name}. Add a new migration instead.`);
        }
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO platform_schema_migration (name, checksum) VALUES ($1, $2)', [
        name,
        checksum,
      ]);
      applied.push(name);
    }
    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
