"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Search } from "lucide-react";
import { isLocalReportType, localReportRows } from "@invoice-monorepo/data-store";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { getLocalStore } from "@/lib/local/local-store";
import { getUiLanguage } from "@/lib/i18n/language";
import { money } from "@/lib/format";
import { REPORT_DEFINITIONS, permissionForReport, type ReportDefinition } from "@/lib/report-definitions";
import { ErrorState, MetricCard, PageHeader } from "./ui";

type ReportRow = Record<string, unknown>;

const PAGE_SIZE = 1000;
const TECHNICAL_COLUMNS = new Set(["__company_name", "id", "company_id", "client_id", "invoice_id", "supplier_bill_id", "account_id", "journal_entry_id", "journal_line_id", "fixed_asset_id", "product_id", "user_id", "created_by", "updated_by"]);

function numericValue(row: ReportRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))) return Number(value);
  }
  return 0;
}

function columnLabel(column: string) {
  return column.replace(/^tenant_name$/, "company").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function cellText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value: unknown) {
  return cellText(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

export function ReportDetailView({ type }: { type: string }) {
  const workspace = useWorkspace();
  const definition: ReportDefinition | undefined = REPORT_DEFINITIONS[type];
  const lang = getUiLanguage();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const allowed = definition ? workspace.can(permissionForReport(type)) : false;
  const canExport = workspace.can("financial.export");

  useEffect(() => {
    if (!definition || workspace.loading || !allowed) return;
    let active = true;
    async function load(source: ReportDefinition) {
      setLoading(true);
      setError("");
      try {
        if (workspace.storage === "local") {
          if (!isLocalReportType(type)) throw new Error("This report needs cloud storage.");
          const store = await getLocalStore();
          if (active) setRows(await localReportRows(store, source.source) as ReportRow[]);
          return;
        }
        const supabase = createClient();
        if (!supabase) throw new Error("Supabase is not configured.");
        const names = new Map(workspace.companies.map((company) => [company.id, company.company_name || ""]));
        const all: ReportRow[] = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          let request = supabase.from(source.source).select("*").in("company_id", workspace.companyIds);
          for (const order of source.orderBy || []) request = request.order(order.column, { ascending: order.ascending !== false, nullsFirst: order.nullsFirst });
          const { data, error: requestError } = await request.range(offset, offset + PAGE_SIZE - 1);
          if (requestError) throw requestError;
          const page = ((data || []) as ReportRow[]).map((row) => ({ ...row, __company_name: names.get(String(row.company_id)) || "" }));
          all.push(...page);
          if (page.length < PAGE_SIZE) break;
        }
        if (active) setRows(all);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "The report could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load(definition);
    return () => { active = false; };
  }, [allowed, definition, retry, type, workspace.companies, workspace.companyIds, workspace.loading, workspace.storage]);

  const columns = useMemo(() => {
    const withTenant = rows.map((row) => ({ ...row, tenant_name: row.__company_name || "" }));
    return Array.from(new Set(withTenant.flatMap((row) => Object.keys(row)))).filter((column) => !TECHNICAL_COLUMNS.has(column)).slice(0, 9);
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [query, rows]);

  if (!definition) return <div className="ux-page"><ErrorState message="This report does not exist." /></div>;
  const title = definition.title[lang];
  const subtitle = definition.subtitle[lang];
  if (workspace.loading) return <div className="ux-page"><PageHeader title={title} description={subtitle} /><div className="ux-state"><p>Loading…</p></div></div>;
  if (!allowed) return <div className="ux-page"><PageHeader title={title} description={subtitle} /><ErrorState message="You do not have permission to view this report." /></div>;

  const total = visible.reduce((sum, row) => sum + numericValue(row, definition.rowAmountKey ? [definition.rowAmountKey] : definition.amountKeys), 0);
  const tenantRow = (row: ReportRow) => ({ ...row, tenant_name: row.__company_name || "—" });
  const fileBase = `operix-${type.replaceAll("_", "-")}-${new Date().toISOString().slice(0, 10)}`;

  function downloadCsv() {
    if (!canExport) return;
    const lines = [columns, ...visible.map((row) => columns.map((column) => cellText(tenantRow(row)[column as keyof ReturnType<typeof tenantRow>])))];
    const blob = new Blob([lines.map((line) => line.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileBase}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // The browser's print dialog saves the page as a PDF (choose "Save as PDF").
  function openPdf() {
    if (!canExport) return;
    const company = workspace.company?.company_name || "";
    const head = columns.map((column) => `<th>${escapeHtml(columnLabel(column))}</th>`).join("");
    const body = visible.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(tenantRow(row)[column as keyof ReturnType<typeof tenantRow>])}</td>`).join("")}</tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(`${company} ${title}`)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:10px}h1{font-size:18px;margin:0}p{color:#667085;margin:4px 0 14px}table{width:100%;border-collapse:collapse}th{background:#f2f5fb;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.04em}th,td{border-bottom:1px solid #e4e9f0;padding:6px 7px;word-break:break-word}tr{page-break-inside:avoid}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(company)} · ${escapeHtml(subtitle)} · ${new Date().toLocaleDateString()} · ${visible.length} rows</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><script>window.onload=function(){window.print()}</script></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) { setError("Allow pop-ups to open the PDF preview."); return; }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  return <div className="ux-page reports-page">
    <PageHeader
      title={title}
      description={subtitle}
      actions={<div className="flex flex-wrap gap-2">
        <Link href="/reports" className="btn"><ArrowLeft size={16} /> All reports</Link>
        {canExport ? <><button type="button" className="btn" onClick={downloadCsv} disabled={!visible.length}><Download size={16} /> CSV</button><button type="button" className="btn btn-primary" onClick={openPdf} disabled={!visible.length}><FileText size={16} /> Preview / PDF</button></> : null}
      </div>}
    />
    {error ? <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} /> : null}
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard label="Rows" value={String(visible.length)} icon={FileText} tone="blue" />
      {definition.amountKeys.length ? <MetricCard label="Total" value={money(total)} icon={FileText} tone="green" /> : null}
    </div>
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#dbe5f5] px-3 py-2"><Search size={16} /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search this report…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    {loading ? <div className="ux-state"><p>Reading posted accounting…</p></div> : visible.length ? <div className="table-wrap mt-4"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{columnLabel(column)}</th>)}</tr></thead><tbody>{visible.slice(0, 500).map((row, index) => <tr key={String(row.id || row.journal_line_id || row.invoice_id || index)}>{columns.map((column) => <td key={column}>{cellText(tenantRow(row)[column as keyof ReturnType<typeof tenantRow>])}</td>)}</tr>)}</tbody></table>{visible.length > 500 ? <p className="muted mt-2 text-xs">Showing the first 500 rows. CSV and PDF include all {visible.length}.</p> : null}</div> : <p className="muted rounded-lg border border-dashed p-8 text-center text-sm">No posted records.</p>}
  </div>;
}
