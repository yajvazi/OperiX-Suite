import type { SqlDriver, SqlValue } from '../driver.ts';

/** The slice of the official `@sqlite.org/sqlite-wasm` oo1 database (`new sqlite3.oo1.OpfsSAHPoolDb(...)` and friends). */
export interface SqliteWasmDatabaseLike {
  exec(options: string | { sql: string; bind?: SqlValue[]; rowMode?: 'object'; returnValue?: 'resultRows' }): unknown;
}

/**
 * Browser driver. Persist the database in the browser's private file system, for example with the
 * `opfs-sahpool` VFS inside a worker, then wrap it:
 *   const store = await LocalDataStore.open(createSqliteWasmDriver(db));
 */
export function createSqliteWasmDriver(db: SqliteWasmDatabaseLike): SqlDriver {
  let depth = 0;
  return {
    async exec(sql) { db.exec(sql); },
    async run(sql, params = []) { db.exec({ sql, bind: [...params] }); },
    async all<T>(sql: string, params: readonly SqlValue[] = []) {
      return (db.exec({ sql, bind: [...params], rowMode: 'object', returnValue: 'resultRows' }) ?? []) as T[];
    },
    async transaction<T>(work: () => Promise<T>) {
      if (depth > 0) return work();
      depth += 1;
      db.exec('BEGIN IMMEDIATE');
      try { const result = await work(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
      finally { depth -= 1; }
    },
  };
}
