import type { SqlDriver, SqlValue } from "@invoice-monorepo/data-store";

type Reply = { id: number; ok: boolean; rows?: unknown[]; error?: string };

/** A SqlDriver that forwards every statement to the database worker and waits for the answer. */
export function createWorkerSqliteDriver(worker: Worker): SqlDriver {
  let nextId = 1;
  const pending = new Map<number, { resolve: (rows: unknown[]) => void; reject: (error: Error) => void }>();
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.ok) entry.resolve(event.data.rows ?? []);
    else entry.reject(new Error(event.data.error || "The browser database failed."));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "The browser database could not start.");
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  const call = (op: "exec" | "run" | "all", sql: string, params?: readonly SqlValue[]) =>
    new Promise<unknown[]>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, sql, params: params ? [...params] : undefined });
    });

  // One transaction at a time: other callers wait their turn instead of landing inside it.
  let depth = 0;
  let tail: Promise<unknown> = Promise.resolve();
  return {
    async exec(sql) { await call("exec", sql); },
    async run(sql, params = []) { await call("run", sql, params); },
    async all<T>(sql: string, params: readonly SqlValue[] = []) { return (await call("all", sql, params)) as T[]; },
    transaction<T>(work: () => Promise<T>): Promise<T> {
      if (depth > 0) return work();
      const turn = tail.then(async () => {
        depth += 1;
        await call("exec", "BEGIN IMMEDIATE");
        try { const result = await work(); await call("exec", "COMMIT"); return result; }
        catch (error) { await call("exec", "ROLLBACK").catch(() => undefined); throw error; }
        finally { depth -= 1; }
      });
      tail = turn.catch(() => undefined);
      return turn;
    },
  };
}
