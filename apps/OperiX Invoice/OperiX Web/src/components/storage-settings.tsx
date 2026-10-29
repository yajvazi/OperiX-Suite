"use client";

import { useRef, useState } from "react";
import { Cloud, Download, HardDrive, Upload } from "lucide-react";
import { resolveWorkspace } from "@invoice-monorepo/api/workspace";
import { copyMasterData, type BackupFile, type StorageMode, type TransferResult } from "@invoice-monorepo/data-store";
import { CloudDataStore } from "@invoice-monorepo/data-store/cloud";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { getLocalStore } from "@/lib/local/local-store";
import { markBackupDone } from "@/lib/local/backup-reminder";
import { browserStorageSupported, setStorageMode } from "@/lib/local/storage-mode";

function summarize(result: TransferResult) {
  const copied = result.copied.clients + result.copied.products + result.copied.vendors;
  const skipped = result.skipped.clients + result.skipped.products + result.skipped.vendors;
  const base = `Copied ${copied} records (${result.copied.clients} customers, ${result.copied.products} products, ${result.copied.vendors} suppliers). ${skipped} already existed.`;
  return result.failed.length ? `${base} Failed: ${result.failed.length} (${result.failed[0].name}: ${result.failed[0].message})` : base;
}

/** Where business data lives: this browser (free) or the OperiX cloud. Backup and copy tools for the browser database. */
export function StorageSettings() {
  const workspace = useWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mode: StorageMode = workspace.storage;
  const supported = browserStorageSupported();

  function choose(next: StorageMode) {
    if (next === mode) return;
    if (next === "local" && !window.confirm("New data will be stored only in this browser. Your existing cloud data is not deleted, but it is not shown here. Clearing site data or losing this computer without a backup means losing the data. Continue?")) return;
    setStorageMode(next);
    window.location.reload();
  }

  async function run(work: () => Promise<string>) {
    setBusy(true); setMessage("");
    try { setMessage(await work()); } catch (error) { setMessage(error instanceof Error ? error.message : "That did not work."); } finally { setBusy(false); }
  }

  const exportBackup = () => run(async () => {
    const file = await (await getLocalStore()).exportBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `operix-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(url);
    markBackupDone();
    return "Backup created. Keep it somewhere safe.";
  });

  const importBackup = (source: File) => run(async () => {
    let file: BackupFile;
    try { file = JSON.parse(await source.text()) as BackupFile; } catch { throw new Error("This file is not an OperiX backup."); }
    const result = await (await getLocalStore()).importBackup(file);
    return `Imported: ${result.inserted} new, ${result.updated} updated, ${result.skipped} skipped. Reload the page to see the data.`;
  });

  const transfer = (direction: "toCloud" | "toDevice") => {
    const toCloud = direction === "toCloud";
    if (!window.confirm(toCloud
      ? "Customers, products and suppliers in this browser are copied to your cloud account. Existing ones are skipped. Invoices and payments are not copied; use the backup file for them."
      : "Customers, products and suppliers from the cloud are copied into this browser. Existing ones are skipped. Invoices and payments are not copied.")) return;
    return run(async () => {
      const supabase = createClient();
      const user = workspace.user;
      if (!supabase || !user) throw new Error("Sign in again to copy data.");
      const scope = await resolveWorkspace(supabase, user.id, { membershipOnly: true });
      const cloud = new CloudDataStore(supabase, { userId: user.id, companyId: scope.company?.id ?? null, companyIds: scope.companyIds });
      const device = await getLocalStore();
      return summarize(toCloud ? await copyMasterData(device, cloud) : await copyMasterData(cloud, device));
    });
  };

  const option = (value: StorageMode, title: string, text: string, Icon: typeof Cloud) => (
    <button type="button" key={value} role="radio" aria-checked={mode === value} disabled={value === "local" && !supported} onClick={() => choose(value)}
      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left ${mode === value ? "border-2 border-[#004ffe] bg-[#edf4ff]" : "border-[#dbe5f5] bg-white"}`} data-testid={`storage-mode-${value}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eaf2ff] text-[#004ffe]"><Icon size={20} /></span>
      <span><b className="block text-sm">{title}</b><span className="muted mt-1 block text-xs">{text}</span></span>
    </button>
  );

  return <div className="mt-6 grid gap-4">
    {option("local", "In this browser (free)", "Everything is stored in this browser on this computer and works offline. No cloud backup. Use the same browser each time.", HardDrive)}
    {option("cloud", "OperiX cloud", "Data is stored in the cloud: backups, the mobile app, teams and permissions.", Cloud)}
    {!supported ? <p className="rounded bg-[#fff8e6] p-3 text-xs text-[#8a5a00]">This browser cannot keep a private database (it needs HTTPS and the browser file system). Use the OperiX cloud, or a current Chrome, Edge, Firefox or Safari.</p> : null}
    {mode === "local" ? <div className="rounded-xl border border-[#dbe5f5] bg-[#f8fbff] p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Backup file</h3>
      <p className="muted mt-1 text-xs">Download a backup regularly and keep it somewhere safe. You can import it in another browser, or in the mobile app.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void exportBackup()} data-testid="storage-export"><Download size={16} /> Export backup</button>
        <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()} data-testid="storage-import"><Upload size={16} /> Import backup</button>
        <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.currentTarget.value = ""; }} />
      </div>
    </div> : null}
    <div className="rounded-xl border border-[#dbe5f5] bg-[#f8fbff] p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Copy your basic data</h3>
      <p className="muted mt-1 text-xs">Customers, products and suppliers can be copied between this browser and the cloud. Repeating it is safe: nothing is duplicated.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={busy || !supported} onClick={() => void transfer("toCloud")} data-testid="storage-copy-to-cloud"><Cloud size={16} /> Browser to cloud</button>
        <button type="button" className="btn" disabled={busy || !supported} onClick={() => void transfer("toDevice")} data-testid="storage-copy-to-device"><HardDrive size={16} /> Cloud to browser</button>
      </div>
    </div>
    {message ? <p className="rounded bg-[#eef4ff] p-3 text-xs text-[#1d3a8a]">{message}</p> : null}
  </div>;
}
