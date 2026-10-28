import type { SqlDriver, SqlValue } from '../driver.ts';

/** The slice of expo-sqlite's SQLiteDatabase (async API) that the engine uses. Passing the real database satisfies it. */
export interface ExpoSqliteDatabaseLike {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

/**
 * Mobile driver. Usage (in the app):
 *   const db = await SQLite.openDatabaseAsync('operix.db');
 *   const store = await LocalDataStore.open(createExpoSqliteDriver(db));
 */
export function createExpoSqliteDriver(db: ExpoSqliteDatabaseLike): SqlDriver {
  let depth = 0;
  return {
    exec: (sql) => db.execAsync(sql),
    async run(sql, params = []) { await db.runAsync(sql, [...params]); },
    all: <T>(sql: string, params: readonly SqlValue[] = []) => db.getAllAsync<T>(sql, [...params]),
    async transaction<T>(work: () => Promise<T>) {
      if (depth > 0) return work();
      depth += 1;
      await db.execAsync('BEGIN IMMEDIATE');
      try { const result = await work(); await db.execAsync('COMMIT'); return result; }
      catch (error) { await db.execAsync('ROLLBACK'); throw error; }
      finally { depth -= 1; }
    },
  };
}
