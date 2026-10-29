/// <reference lib="webworker" />
// Owns the browser database. The page talks to it through worker-driver.ts; the database file lives in
// the browser's private file system (OPFS), so it survives reloads but never leaves this device.

type DbRequest = { id: number; op: "exec" | "run" | "all"; sql: string; params?: Array<string | number | null> };
type Database = { exec(options: string | { sql: string; bind?: unknown[]; rowMode?: "object"; returnValue?: "resultRows" }): unknown };

let ready: Promise<Database> | null = null;

function openDatabase(): Promise<Database> {
  if (!ready) {
    const lockMessage = "OperiX is open in another tab or window. Close the other one and reload this page.";
    // A second tab waits for the first one to release the file system handles; do not wait forever.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(lockMessage)), 15_000));
    ready = Promise.race([(async () => {
      // Served from /public/sqlite (copied by scripts/copy-sqlite-wasm.mjs); a variable keeps bundlers from following it.
      const loaderUrl = new URL("/sqlite/index.mjs", self.location.origin).href;
      const { default: sqlite3InitModule } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ loaderUrl);
      const sqlite3 = await sqlite3InitModule();
      const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "operix-local", directory: "/operix-local", clearOnInit: false });
      return new pool.OpfsSAHPoolDb("/operix-local.db") as unknown as Database;
    })(), timeout]).catch((error) => {
      ready = null;
      const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
      // The browser file system lets one tab hold the database at a time.
      if (/NoModificationAllowed|Access Handle|createSyncAccessHandle|locked/i.test(text)) throw new Error(lockMessage);
      throw error;
    });
  }
  return ready;
}

self.onmessage = async (event: MessageEvent<DbRequest>) => {
  const { id, op, sql, params } = event.data;
  try {
    const db = await openDatabase();
    if (op === "exec") { db.exec(sql); self.postMessage({ id, ok: true, rows: [] }); return; }
    if (op === "run") { db.exec({ sql, bind: params ? [...params] : [] }); self.postMessage({ id, ok: true, rows: [] }); return; }
    const rows = db.exec({ sql, bind: params ? [...params] : [], rowMode: "object", returnValue: "resultRows" }) ?? [];
    self.postMessage({ id, ok: true, rows });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
