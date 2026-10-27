"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Database, Download, FileUp, FileJson, Upload } from "lucide-react";
import { autoMapTransferColumns, dataTransferDefinitions, mappedTransferRecord, missingTransferFields, normalizeTransferRow, parseTransferCsv, stringifyTransferCsv, type DataTransferEntity } from "@invoice-monorepo/api";
import { scopedResource } from "@invoice-monorepo/api/workspace";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";

type TransferRow = Record<string, unknown>;

const entities: DataTransferEntity[] = ["clients", "products", "vendors", "expenses"];

function downloadText(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function identityField(entity: DataTransferEntity, row: TransferRow) {
  if (entity === "products" && String(row.sku || "").trim()) return "sku";
  if (entity === "clients") return ["tax_id", "fiscal_number", "nui"].find((key) => String(row[key] || "").trim()) || null;
  if (entity === "vendors") return ["tax_id", "fiscal_number", "vat_number"].find((key) => String(row[key] || "").trim()) || null;
  return null;
}

export function DataTransferSettings() {
  const workspace = useWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<DataTransferEntity>("clients");
  const [pendingRows, setPendingRows] = useState<TransferRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const definition = dataTransferDefinitions[entity];
  const importPermission = entity === "clients" ? "customer.create" : entity === "products" ? "product.create" : entity === "vendors" ? "expense.manage" : "expense.create";
  const canImport = workspace.can(importPermission);
  const canExport = workspace.can("financial.export");
  const invalidRows = pendingRows.filter((row) => missingTransferFields(entity, row).length > 0).length;

  function changeEntity(nextEntity: DataTransferEntity) {
    setEntity(nextEntity);
    setPendingRows([]);
    setFileName("");
    setMessage("");
    setSuccess("");
  }

  async function exportData(format: "csv" | "json") {
    if (!canExport) { setMessage("Financial export permission is required."); return; }
    setBusy(true); setMessage(""); setSuccess("");
    try {
      const supabase = createClient();
      if (!supabase || !workspace.user || !workspace.companyIds.length) throw new Error("No active workspace is available.");
      const scope = scopedResource(workspace.user.id, workspace.companyIds);
      const result = await supabase.from(definition.table).select(definition.exportFields.map((field) => field.key).join(",")).or(scope).limit(5000);
      if (result.error) throw result.error;
      const rows = (result.data || []) as unknown as TransferRow[];
      const date = new Date().toISOString().slice(0, 10);
      if (format === "csv") downloadText(`operix-${entity}-${date}.csv`, `\uFEFF${stringifyTransferCsv(entity, rows)}`, "text/csv;charset=utf-8");
      else downloadText(`operix-${entity}-${date}.json`, JSON.stringify({ entity, exported_at: new Date().toISOString(), rows }, null, 2), "application/json");
      setSuccess(`${rows.length} ${definition.label.toLowerCase()} exported.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The export could not be completed.");
    } finally { setBusy(false); }
  }

  async function readImportFile(file: File) {
    setMessage(""); setSuccess(""); setFileName(file.name);
    if (!/\.csv$/i.test(file.name)) { setMessage("Choose a CSV file for import."); return; }
    const parsed = parseTransferCsv(await file.text());
    if (!parsed.headers.length || !parsed.rows.length) { setMessage("The CSV does not contain any data rows."); return; }
    const mapping = autoMapTransferColumns(entity, parsed.headers);
    const rows = parsed.rows.map((record) => normalizeTransferRow(entity, mappedTransferRecord(record, mapping)));
    setPendingRows(rows);
    const missing = definition.importFields.filter((field) => field.required && !Object.values(mapping).includes(field.key)).map((field) => field.label);
    if (missing.length) setMessage(`Required columns not found: ${missing.join(", ")}.`);
  }

  async function findExisting(supabase: ReturnType<typeof createClient>, row: TransferRow) {
    if (!supabase || !workspace.companyId) return null;
    const key = identityField(entity, row);
    if (!key) return null;
    const value = String(row[key] || "").trim();
    if (!value) return null;
    const result = await supabase.from(definition.table).select("id").eq("company_id", workspace.companyId).eq(key, value).maybeSingle();
    if (result.error) throw result.error;
    return result.data?.id ? String(result.data.id) : null;
  }

  async function importData() {
    if (!canImport) { setMessage("The required permission for this data type is not enabled."); return; }
    if (!pendingRows.length || invalidRows) { setMessage("Fix the required fields before importing."); return; }
    setBusy(true); setMessage(""); setSuccess("");
    try {
      const supabase = createClient();
      if (!supabase || !workspace.user || !workspace.companyId) throw new Error("No active company workspace is available.");
      let created = 0; let updated = 0;
      for (const row of pendingRows) {
        const payload: TransferRow = { ...row, user_id: workspace.user.id, company_id: workspace.companyId };
        if (entity === "products") {
          payload.unit = payload.unit || "pcs";
          payload.unit_price = payload.unit_price ?? 0;
          payload.tax_rate = payload.tax_rate ?? 18;
          payload.tax_included = payload.tax_included ?? false;
          payload.purchase_currency = payload.purchase_currency || "EUR";
          payload.exchange_rate = payload.exchange_rate || 1;
          payload.vat_treatment = payload.vat_treatment || "standard_18";
        }
        if (entity === "vendors") payload.default_currency = payload.default_currency || "EUR";
        if (entity === "expenses") payload.type = "expense";
        const existingId = await findExisting(supabase, row);
        const result = existingId
          ? await supabase.from(definition.table).update(payload).eq("id", existingId).eq("company_id", workspace.companyId).select("id").single()
          : await supabase.from(definition.table).insert(payload).select("id").single();
        if (result.error) throw result.error;
        if (existingId) updated += 1; else created += 1;
      }
      setPendingRows([]); setFileName("");
      setSuccess(`${created} created, ${updated} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The import could not be completed.");
    } finally { setBusy(false); }
  }

  return <div className="mt-6">
    <div className="rounded-xl border border-[#dbe5f5] bg-[#f8fbff] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#eaf2ff] text-[#004ffe]"><Database size={20} /></span><div><h3 className="text-sm font-semibold">Data Import & Export</h3><p className="muted mt-1 text-xs">Move clients, products, vendors and expenses using tenant-scoped CSV or JSON files.</p></div></div>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] text-[#16794c]">RLS protected</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {entities.map((item) => <button type="button" key={item} onClick={() => changeEntity(item)} className={`rounded-lg border p-3 text-left text-xs ${entity === item ? "border-[#004ffe] bg-[#edf4ff] text-[#004ffe]" : "border-[#dbe5f5] bg-white"}`}><b>{dataTransferDefinitions[item].label}</b><span className="muted mt-1 block text-[11px]">{dataTransferDefinitions[item].description}</span></button>)}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy || workspace.loading || !canExport} onClick={() => void exportData("csv")}><Download size={16} /> Export CSV</button>
        <button type="button" className="btn" disabled={busy || workspace.loading || !canExport} onClick={() => void exportData("json")}><FileJson size={16} /> Export JSON</button>
        <button type="button" className="btn" disabled={busy || !canImport} onClick={() => fileRef.current?.click()}><FileUp size={16} /> Choose CSV to import</button>
        <input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImportFile(file); event.currentTarget.value = ""; }} />
      </div>
      <div className="mt-4 rounded-lg border border-dashed border-[#bfd0e8] bg-white p-4 text-xs">
        <div className="flex items-center gap-2"><Upload size={15} className="text-[#004ffe]" /><b>{fileName || "Import preview"}</b></div>
        {fileName ? <p className="muted mt-2">{pendingRows.length} rows detected · {invalidRows} rows missing required values. Headers are matched in English and Albanian.</p> : <p className="muted mt-2">Required fields: {definition.importFields.filter((field) => field.required).map((field) => field.label).join(", ")}. Existing records with a matching business identifier are updated; other rows are created.</p>}
        {fileName && invalidRows === 0 ? <button type="button" className="btn btn-primary mt-3" disabled={busy} onClick={() => void importData()}><CheckCircle2 size={15} />{busy ? "Importing…" : `Import ${pendingRows.length} rows`}</button> : null}
      </div>
      {message ? <p className="mt-4 rounded bg-[#fff3f2] p-3 text-xs text-[#d92d20]">{message}</p> : null}
      {success ? <p className="mt-4 rounded bg-[#ecfdf3] p-3 text-xs text-[#16794c]">{success}</p> : null}
      {!canExport ? <p className="muted mt-3 text-[11px]">Financial export permission is required to download workspace data.</p> : null}
      {!canImport ? <p className="muted mt-3 text-[11px]">The required permission for this entity is not enabled.</p> : null}
    </div>
  </div>;
}
