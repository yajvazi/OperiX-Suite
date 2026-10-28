export type SqlValue = string | number | null;

/**
 * The only thing the local engine needs from SQLite. expo-sqlite (mobile) and a SQLite
 * build for the browser (web) each implement this; tests use node:sqlite.
 */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  /** Runs `work` atomically: everything commits, or nothing does. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
