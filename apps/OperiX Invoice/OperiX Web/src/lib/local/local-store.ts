import { LocalDataStore } from "@invoice-monorepo/data-store";
import { createWorkerSqliteDriver } from "./worker-driver";

let localStore: Promise<LocalDataStore> | null = null;

/** The browser database for this device (one per browser profile). Only call this in the browser. */
export function getLocalStore(): Promise<LocalDataStore> {
  if (!localStore) {
    localStore = LocalDataStore.open(createWorkerSqliteDriver(new Worker(new URL("./sqlite.worker.ts", import.meta.url), { type: "module" })))
      .then((store) => {
        // Ask the browser not to evict the database when disk space runs low.
        void navigator.storage?.persist?.().catch(() => undefined);
        return store;
      })
      .catch((error) => { localStore = null; throw error; });
  }
  return localStore;
}
