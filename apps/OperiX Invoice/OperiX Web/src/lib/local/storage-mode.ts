import type { StorageMode } from "@invoice-monorepo/data-store";

const KEY = "operix.storageMode";

/** Existing accounts keep using the cloud until they choose otherwise. */
export function getStorageMode(): StorageMode {
  try { return window.localStorage.getItem(KEY) === "local" ? "local" : "cloud"; } catch { return "cloud"; }
}

export function setStorageMode(mode: StorageMode) {
  window.localStorage.setItem(KEY, mode);
  window.dispatchEvent(new Event("operix-storage-mode"));
}

export function browserStorageSupported(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined" && "storage" in navigator && typeof navigator.storage.getDirectory === "function" && window.isSecureContext;
}
