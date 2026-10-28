import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlValue } from '../driver.ts';

/** In-process SQLite for tests and tooling. */
export function createNodeSqliteDriver(path = ':memory:'): SqlDriver & { close(): void } {
  const db = new DatabaseSync(path);
  let depth = 0;
  return {
    async exec(sql) { db.exec(sql); },
    async run(sql, params = []) { db.prepare(sql).run(...(params as SqlValue[])); },
    async all<T>(sql: string, params: readonly SqlValue[] = []) { return db.prepare(sql).all(...(params as SqlValue[])) as T[]; },
    async transaction<T>(work: () => Promise<T>) {
      if (depth > 0) return work();
      depth += 1;
      db.exec('BEGIN IMMEDIATE');
      try { const result = await work(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
      finally { depth -= 1; }
    },
    close() { db.close(); },
  };
}
