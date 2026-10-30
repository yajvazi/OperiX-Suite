"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowLeft, Download, FileText, Search } from "lucide-react";
import { isLocalReportType, localReportRows } from "@invoice-monorepo/data-store";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { getLocalStore } from "@/lib/local/local-store";
import { getUiLanguage } from "@/lib/i18n/language";
import { money } from "@/lib/format";
import { REPORT_DEFINITIONS, permissionForReport, type ReportDefinition } from "@/lib/report-definitions";
import { DATE_COLUMN, MONEY_COLUMN, columnLabel, rt, valueLabel } from "@/lib/report-i18n";
import { ErrorState, MetricCard, PageHeader } from "./ui";
import { SalesBookReport } from "./sales-book-report";

type ReportRow = Record<string, unknown>;

const PAGE_SIZE = 1000;
const SHOWN_ROWS = 300;
const TECHNICAL_COLUMNS = new Set(["__company_name", "id", "company_id", "client_id", "invoice_id", "supplier_bill_id", "account_id", "journal_entry_id", "journal_line_id", "fixed_asset_id", "product_id", "user_id", "created_by", "updated_by"]);

function numericValue(row: ReportRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))) return Number(value);
  }
  return 0;
}

function plain(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function display(column: string, value: unknown, lang: "en" | "sq" = "en") {
  if (value === null || value === undefined || value === "") return "—";
  if (MONEY_COLUMN.test(column) && !DATE_COLUMN.test(column) && value !== "" && !Number.isNaN(Number(value)) && typeof value !== "boolean") return money(Number(value));
  if (DATE_COLUMN.test(column) && typeof value === "string") return value.slice(0, 10);
  return typeof value === "string" && !MONEY_COLUMN.test(column) ? valueLabel(lang, value) : plain(value);
}

function escapeHtml(value: unknown) {
  return plain(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}

export function ReportDetailView({ type }: { type: string }) {
  if (type === "sales_book") return <SalesBookReport />;
  return <GenericReport type={type} />;
}

function GenericReport({ type }: { type: string }) {
  const workspace = useWorkspace();
  const definition: ReportDefinition | undefined = REPORT_DEFINITIONS[type];
  const lang = getUiLanguage();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ column: string; descending: boolean } | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);
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
          const page = ((data || []) as ReportRow[]).map((row) => ({ ...row, __company_name: names.get(String(row.company_id)) || "", tenant_name: names.get(String(row.company_id)) || "—" }));
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

  const columns = useMemo(() => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((column) => !TECHNICAL_COLUMNS.has(column)).slice(0, 10), [rows]);
  const dateColumn = useMemo(() => columns.find((column) => /date$|^period_start$/.test(column)), [columns]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = rows.filter((row) => {
      if (needle && !Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle))) return false;
      if (dateColumn && (from || to)) {
        const day = String(row[dateColumn] ?? "").slice(0, 10);
        if (!day) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      return true;
    });
    if (sort) {
      const { column, descending } = sort;
      result = [...result].sort((a, b) => {
        const left = a[column]; const right = b[column];
        const bothNumbers = !Number.isNaN(Number(left)) && !Number.isNaN(Number(right)) && left !== "" && right !== "" && left != null && right != null;
        const order = bothNumbers ? Number(left) - Number(right) : String(left ?? "").localeCompare(String(right ?? ""));
        return descending ? -order : order;
      });
    }
    return result;
  }, [dateColumn, from, query, rows, sort, to]);

  if (!definition) return <div className="ux-page reports-page"><ErrorState message={rt(lang, "This report does not exist.")} /></div>;
  const title = definition.title[lang];
  const subtitle = definition.subtitle[lang];
  const back = <Link href="/reports" className="btn"><ArrowLeft size={16} /> {rt(lang, "All reports")}</Link>;
  if (workspace.loading) return <div className="ux-page reports-page"><PageHeader title={title} description={subtitle} actions={back} /><div className="ux-state"><p>{rt(lang, "Loading…")}</p></div></div>;
  if (!allowed) return <div className="ux-page reports-page"><PageHeader title={title} description={subtitle} actions={back} /><ErrorState message={rt(lang, "You do not have permission to view this report.")} /></div>;

  const total = visible.reduce((sum, row) => sum + numericValue(row, definition.rowAmountKey ? [definition.rowAmountKey] : definition.amountKeys), 0);
  const fileBase = `operix-${type.replaceAll("_", "-")}-${new Date().toISOString().slice(0, 10)}`;
  const filtered = Boolean(query || from || to);
  const companyCount = new Set(visible.map((row) => String(row.company_id || row.__company_name || ""))).size;
  const days = dateColumn ? visible.map((row) => String(row[dateColumn] ?? "").slice(0, 10)).filter(Boolean).sort() : [];
  const periodLabel = days.length ? (days[0] === days[days.length - 1] ? days[0] : `${days[0]} – ${days[days.length - 1]}`) : "—";

  function downloadCsv() {
    if (!canExport) return;
    const lines = [columns.map((column) => columnLabel(lang, column)), ...visible.map((row) => columns.map((column) => plain(row[column])))];
    const blob = new Blob(["﻿" + lines.map((line) => line.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
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
    const head = columns.map((column) => `<th>${escapeHtml(columnLabel(lang, column))}</th>`).join("");
    const body = visible.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(display(column, row[column], lang))}</td>`).join("")}</tr>`).join("");
    const meta = [company, subtitle, `${rt(lang, "Prepared")} ${new Date().toLocaleDateString(lang === "sq" ? "sq-XK" : "en-GB")}`, `${visible.length} ${rt(lang, "rows")}`].filter(Boolean).join(" · ");
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(`${company} ${title}`)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:10px}h1{font-size:18px;margin:0}p{color:#667085;margin:4px 0 14px}table{width:100%;border-collapse:collapse}th{background:#f2f5fb;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.04em}th,td{border-bottom:1px solid #e4e9f0;padding:6px 7px;word-break:break-word}tr{page-break-inside:avoid}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(meta)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><script>window.onload=function(){window.print()}</script></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) { setError(rt(lang, "Allow pop-ups to open the PDF preview.")); return; }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  function toggleSort(column: string) {
    setSort((current) => current?.column === column ? (current.descending ? null : { column, descending: true }) : { column, descending: false });
  }

  return <div className="ux-page reports-page">
    <PageHeader
      title={title}
      description={subtitle}
      actions={<div className="flex flex-wrap gap-2">
        {back}
        {canExport ? <><button type="button" className="btn" onClick={downloadCsv} disabled={!visible.length}><Download size={16} /> {rt(lang, "CSV")}</button><button type="button" className="btn btn-primary" onClick={openPdf} disabled={!visible.length}><FileText size={16} /> {rt(lang, "Preview / PDF")}</button></> : null}
      </div>}
    />
    {error ? <ErrorState message={rt(lang, error)} onRetry={() => setRetry((value) => value + 1)} /> : null}
    <section className="grid gap-3 sm:grid-cols-3">
      <MetricCard label={rt(lang, "Rows")} value={String(visible.length)} icon={FileText} tone="blue" />
      <MetricCard label={definition.amountKeys.length ? rt(lang, "Total") : rt(lang, "Period")} value={definition.amountKeys.length ? money(total) : periodLabel} icon={FileText} tone="green" />
      <MetricCard label={rt(lang, "Companies")} value={String(companyCount)} icon={FileText} tone="slate" />
    </section>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <div className="flex min-w-60 flex-1 items-center gap-2 rounded-lg border border-[#dbe5f5] px-3 py-2"><Search size={16} /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={rt(lang, "Search this report…")} aria-label={rt(lang, "Search this report…")} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {dateColumn ? <><label className="field"><span>{rt(lang, "From")}</span><input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="field"><span>{rt(lang, "To")}</span><input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></> : null}
      {filtered ? <button type="button" className="btn" onClick={() => { setQuery(""); setFrom(""); setTo(""); }}>{rt(lang, "Clear filters")}</button> : null}
    </div>
    {loading ? <div className="ux-state"><p>{rt(lang, "Reading posted accounting…")}</p></div> : visible.length ? <div className="table-wrap mt-4">
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column} className={MONEY_COLUMN.test(column) && !DATE_COLUMN.test(column) ? "numeric" : undefined}><button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(column)} aria-label={`${rt(lang, "Sort")}: ${columnLabel(lang, column)}`}>{columnLabel(lang, column)}<ArrowDownUp size={11} className={sort?.column === column ? "" : "opacity-30"} /></button></th>)}</tr></thead>
        <tbody>{visible.slice(0, SHOWN_ROWS).map((row, index) => <Fragment key={String(row.id || row.journal_line_id || row.invoice_id || index)}>
          <tr tabIndex={0} className="cursor-pointer" onClick={() => setOpenRow(openRow === index ? null : index)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpenRow(openRow === index ? null : index); } }}>{columns.map((column) => <td key={column} className={MONEY_COLUMN.test(column) && !DATE_COLUMN.test(column) ? "numeric" : undefined}>{display(column, row[column], lang)}</td>)}</tr>
          {openRow === index ? <tr><td colSpan={columns.length}><div className="grid gap-x-6 gap-y-2 p-3 text-xs sm:grid-cols-2 lg:grid-cols-3" aria-label={rt(lang, "Details")}>{Object.keys(row).filter((column) => !TECHNICAL_COLUMNS.has(column) || column === "id").filter((column) => column !== "tenant_name").map((column) => <div key={column}><span className="muted block">{columnLabel(lang, column)}</span><strong className="break-words">{display(column, row[column], lang)}</strong></div>)}</div></td></tr> : null}
        </Fragment>)}</tbody>
      </table>
      <p className="muted mt-2 text-xs">{visible.length > SHOWN_ROWS ? `${rt(lang, "Showing the first")} ${SHOWN_ROWS} ${rt(lang, "rows. CSV and PDF include all")} ${visible.length}. ` : ""}{rt(lang, "Click a row to see all its details.")}</p>
    </div> : <p className="muted rounded-lg border border-dashed p-8 text-center text-sm">{rt(lang, filtered ? "No rows match the filters." : "No posted records.")}</p>}
  </div>;
}
