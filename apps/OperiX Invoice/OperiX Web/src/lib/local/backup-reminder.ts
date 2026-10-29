const KEY = "operix.lastBackupAt";
const DAY = 86_400_000;

export function markBackupDone() {
  try { window.localStorage.setItem(KEY, String(Date.now())); } catch { /* the reminder just keeps showing */ }
}

/** True when there is data worth saving and no backup was downloaded in the last week. */
export function backupDue(hasData: boolean): boolean {
  if (!hasData) return false;
  try { const last = Number(window.localStorage.getItem(KEY) || 0); return !last || Date.now() - last > 7 * DAY; } catch { return true; }
}
