"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HardDrive, X } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { getLocalStore } from "@/lib/local/local-store";
import { backupDue } from "@/lib/local/backup-reminder";

/** In on-device mode the browser is the only copy of the business, so remind people to download a backup. */
export function LocalDataBanner() {
  const workspace = useWorkspace();
  const [due, setDue] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (workspace.loading || workspace.storage !== "local") return;
    let cancelled = false;
    void getLocalStore().then(async (store) => {
      const hasData = (await store.list("invoices", { limit: 1 })).length + (await store.list("clients", { limit: 1 })).length > 0;
      if (!cancelled) setDue(backupDue(hasData));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [workspace.loading, workspace.storage]);
  if (workspace.storage === "local" && workspace.error) {
    return <div className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900 lg:mx-6" role="alert">
      <HardDrive size={16} className="mt-0.5 shrink-0" /><p className="min-w-0 flex-1">{workspace.error}</p>
    </div>;
  }
  if (!due || dismissed) return null;
  return <div className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 lg:mx-6" role="status">
    <HardDrive size={16} className="mt-0.5 shrink-0" />
    <p className="min-w-0 flex-1">Your data is stored only in this browser. <Link href="/settings?tab=storage" className="font-semibold underline">Download a backup</Link> so it is not lost if the browser data is cleared.</p>
    <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)}><X size={14} /></button>
  </div>;
}
