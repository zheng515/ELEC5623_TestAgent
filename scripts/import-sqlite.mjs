import nextEnv from "@next/env";
/** One-time, transactional import. The legacy SQLite file is opened read-only. */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

async function main() {
  nextEnv.loadEnvConfig(process.cwd(), true);
  const auth = await import('../lib/auth.ts');
  const source = resolve(process.argv[2] || join(auth.dataDir, 'reqtest.sqlite'));
  if (!existsSync(source)) throw new Error('Legacy SQLite file not found. Supply its path after --.');
  await auth.getAuth();
  const legacy = new DatabaseSync(source, { readOnly: true });
  const client = await auth.database.connect();
  const counts = {};
  try {
    legacy.exec('BEGIN');
    await client.query('BEGIN');
    for (const table of ['user', 'account', 'session', 'verification', 'rateLimit', 'runs']) {
      if (!legacy.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table', table)) continue;
      const { rows: columns } = await client.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position', [table]);
      const types = new Map(columns.map(column => [column.column_name, column.data_type]));
      const rows = legacy.prepare(`SELECT * FROM "${table}"`).all();
      let inserted = 0;
      for (const row of rows) {
        if (table === 'runs' && !row.created_at) {
          const date = new Date(JSON.parse(row.report).createdAt);
          row.created_at = Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
        }
        const entries = Object.entries(row).filter(([key]) => types.has(key));
        const values = entries.map(([key, value]) => {
          if (value === null) return null;
          const type = types.get(key);
          if (type === 'boolean') return Boolean(value);
          if (type.startsWith('timestamp')) {
            const date = new Date(typeof value === 'number' ? value : String(value));
            if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date in ${table}.${key}; import rolled back.`);
            return date;
          }
          if (type === 'jsonb' && typeof value === 'string') return JSON.parse(value);
          return value;
        });
        const names = entries.map(([key]) => `"${key}"`).join(',');
        const params = values.map((_, index) => '$' + (index + 1)).join(',');
        const conflict = table === 'rateLimit' ? 'ON CONFLICT DO NOTHING' : 'ON CONFLICT (id) DO NOTHING';
        const result = await client.query(`INSERT INTO "${table}" (${names}) VALUES (${params}) ${conflict}`, values);
        inserted += result.rowCount;
      }
      counts[table] = { source: rows.length, inserted };
    }
    await client.query('COMMIT');
    legacy.exec('COMMIT');
    console.log('Legacy import complete. Existing PostgreSQL IDs were retained; SQLite was not changed.');
    console.log(JSON.stringify(counts, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { legacy.close(); client.release(); await auth.database.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
