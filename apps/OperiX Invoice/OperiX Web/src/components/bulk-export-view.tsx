"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Search } from "lucide-react";
import { listExpenses, listInvoices, listPayments } from "@invoice-monorepo/api/repositories";
import { documentTypeLabel, resolveCommercialDocumentType } from "@invoice-monorepo/commercial-documents";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { getUiLanguage } from "@/lib/i18n/language";
import { invoiceRowToDraft } from "@/lib/invoice-export";
import { createZip, safeFileName } from "@/lib/zip";
import { money } from "@/lib/format";
import { ErrorState, MetricCard, PageHeader } from "./ui";
import type { DocumentCompany } from "./invoice-document";

type Kind = "invoices" | "expenses" | "payments";
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const COPY = {
  en: {
    invoices: "Export invoices", expenses: "Export expenses", payments: "Export payments",
    description: "Choose documents and download them as PDFs in one ZIP file.", back: "Reports & taxes", filters: "Filters", from: "From", to: "To",
    search: "Search by name…", selectAll: "Select all shown", clearAll: "Clear selection", selected: "selected", shown: "shown", download: "Download ZIP", preparing: "Preparing",
    empty: "No documents match the filters.", permission: "You do not have permission to export financial documents.", local: "Bulk PDF export needs cloud storage.",
    failed: "Some documents could not be exported:", number: "Number", date: "Date", party: "Name", amount: "Amount", loadFailed: "The documents could not be loaded.",
    kinds: { invoices: "Invoices", expenses: "Expenses", payments: "Payments" },
  },
  sq: {
    invoices: "Eksporto faturat", expenses: "Eksporto shpenzimet", payments: "Eksporto pagesat",
    description: "Zgjidhni dokumentet dhe shkarkojini si PDF në një skedar ZIP.", back: "Raportet dhe tatimet", filters: "Filtrat", from: "Nga", to: "Deri",
    search: "Kërko sipas emrit…", selectAll: "Zgjidh të gjitha të shfaqurat", clearAll: "Pastro përzgjedhjen", selected: "të zgjedhura", shown: "të shfaqura", download: "Shkarko ZIP", preparing: "Po përgatitet",
    empty: "Asnjë dokument nuk përputhet me filtrat.", permission: "Nuk keni leje për të eksportuar dokumente financiare.", local: "Eksporti masiv i PDF kërkon ruajtje në cloud.",
    failed: "Disa dokumente nuk u eksportuan:", number: "Numri", date: "Data", party: "Emri", amount: "Shuma", loadFailed: "Dokumentet nuk u ngarkuan.",
    kinds: { invoices: "Faturat", expenses: "Shpenzimet", payments: "Pagesat" },
  },
} as const;

const dateOf = (kind: Kind, row: Row) => String(kind === "invoices" ? row.issue_date : kind === "expenses" ? row.date : row.payment_date || "").slice(0, 10);
const partyOf = (kind: Kind, row: Row) => String(kind === "expenses" ? row.vendor_name || "" : row.client?.name || "");
const amountOf = (kind: Kind, row: Row) => Number(kind === "invoices" ? row.total_amount : row.amount) || 0;
const numberOf = (kind: Kind, row: Row) => kind === "invoices" ? String(row.invoice_number || row.id) : kind === "payments" ? String(row.payment_number || row.id) : `EXP-${String(row.id || "").slice(0, 8).toUpperCase()}`;

export function BulkExportView({ kind }: { kind: Kind }) {
  const workspace = useWorkspace();
  const lang = getUiLanguage();
  const c = COPY[lang];
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const allowed = workspace.can("financial.export");
  const local = workspace.storage === "local";

  useEffect(() => {
    if (workspace.loading || !allowed || local || !workspace.user) return;
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    const scope = { userId: workspace.user.id, companyIds: workspace.companyIds };
    void (async () => {
      setLoading(true); setError("");
      try {
        let data: Row[];
        if (kind === "invoices") {
          const all = await listInvoices(supabase, scope, { select: "*, client:clients(*), items:invoice_items(*, product:products(sku,name,image_url))" }) as Row[];
          data = all.filter((row) => ["INVOICE", "FINAL_INVOICE", "ADVANCE_INVOICE", "SIMPLIFIED_INVOICE"].includes(resolveCommercialDocumentType(row)) && !["cancelled", "credited", "reversed"].includes(String(row.status || "").toLowerCase()));
        } else if (kind === "expenses") {
          data = (await listExpenses(supabase, scope) as Row[]).filter((row) => String(row.type || "expense").toLowerCase() !== "income");
        } else {
          data = await listPayments(supabase, scope) as Row[];
        }
        if (active) { setRows(data); setSelected(new Set()); }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : c.loadFailed);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [allowed, c.loadFailed, kind, local, workspace.companyIds, workspace.loading, workspace.user]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const day = dateOf(kind, row);
      return (!from || day >= from) && (!to || day <= to) && (!needle || partyOf(kind, row).toLowerCase().includes(needle));
    });
  }, [from, kind, query, rows, to]);
  const allShownSelected = visible.length > 0 && visible.every((row) => selected.has(String(row.id)));
  const selectedRows = rows.filter((row) => selected.has(String(row.id)));

  function toggle(id: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleAll() {
    setSelected((current) => { const next = new Set(current); visible.forEach((row) => allShownSelected ? next.delete(String(row.id)) : next.add(String(row.id))); return next; });
  }

  async function exportZip() {
    if (!selectedRows.length) return;
    const source = (workspace.company || workspace.profile) as Row | null;
    const tenant = String(source?.company_name || workspace.company?.name || "OperiX");
    const company: DocumentCompany = { name: tenant, email: source?.email || "", phone: source?.phone || "", address: source?.address || "", city: [workspace.company?.city, workspace.company?.country].filter(Boolean).join(", "), taxId: source?.tax_id || workspace.company?.fiscal_number || workspace.company?.vat_number || "", businessId: workspace.company?.unique_business_number, vatNumber: workspace.company?.vat_number, bankName: source?.bank_name || "", iban: source?.bank_iban || "", website: source?.website || "", logoUrl: source?.logo_url, signatureUrl: source?.signature_url, stampUrl: source?.stamp_url, language: source?.invoice_language };
    const config = workspace.company?.template_config || workspace.profile?.template_config;
    const files: Array<{ name: string; data: Uint8Array }> = [];
    const failed: string[] = [];
    const used = new Set<string>();
    setFailures([]); setProgress(0);
    for (let index = 0; index < selectedRows.length; index += 1) {
      const row = selectedRows[index];
      const number = numberOf(kind, row);
      try {
        const response = kind === "invoices"
          ? await fetch("/api/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoice_id: row.id, draft: invoiceRowToDraft(row, workspace.company?.currency || "EUR"), client: row.client || undefined, company, receipt: false, template: "corporate", config }) })
          : await fetch("/api/export/transaction-pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id: row.id, language: lang }) });
        if (!response.ok) throw new Error(String(response.status));
        const base = safeFileName(`${tenant} - ${number} - ${partyOf(kind, row) || c.kinds[kind]}`);
        let name = `${base}.pdf`;
        for (let copy = 2; used.has(name); copy += 1) name = `${base} (${copy}).pdf`;
        used.add(name);
        files.push({ name, data: new Uint8Array(await response.arrayBuffer()) });
      } catch {
        failed.push(number);
      }
      setProgress(Math.round(((index + 1) / selectedRows.length) * 100));
    }
    if (files.length) {
      const url = URL.createObjectURL(createZip(files));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(`${tenant} - ${c.kinds[kind]} - ${from || "…"} - ${to || "…"}`)}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    setFailures(failed);
    setProgress(null);
  }

  const header = <PageHeader title={c[kind]} description={c.description} actions={<Link href="/reports" className="btn"><ArrowLeft size={16} /> {c.back}</Link>} />;
  if (workspace.loading) return <div className="ux-page reports-page">{header}<div className="ux-state"><p>…</p></div></div>;
  if (!allowed) return <div className="ux-page reports-page">{header}<ErrorState message={c.permission} /></div>;
  if (local) return <div className="ux-page reports-page">{header}<ErrorState message={c.local} /></div>;

  const total = selectedRows.reduce((sum, row) => sum + amountOf(kind, row), 0);
  return <div className="ux-page reports-page">
    {header}
    <section className="grid gap-3 sm:grid-cols-3">
      <MetricCard label={c.kinds[kind]} value={`${visible.length} ${c.shown}`} icon={FileText} tone="blue" />
      <MetricCard label={c.selected} value={String(selectedRows.length)} icon={Download} tone="green" />
      <MetricCard label={c.amount} value={money(total)} icon={FileText} tone="slate" />
    </section>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <div className="flex min-w-60 flex-1 items-center gap-2 rounded-lg border border-[#dbe5f5] px-3 py-2"><Search size={16} /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={c.search} aria-label={c.search} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <label className="field"><span>{c.from}</span><input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="field"><span>{c.to}</span><input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="button" className="btn" onClick={toggleAll} disabled={!visible.length}>{allShownSelected ? c.clearAll : c.selectAll}</button>
      <button type="button" className="btn btn-primary" onClick={() => void exportZip()} disabled={!selectedRows.length || progress !== null}><Download size={16} /> {progress !== null ? `${c.preparing} ${progress}%` : `${c.download} (${selectedRows.length})`}</button>
    </div>
    {failures.length ? <p className="mt-3 rounded-md bg-[#fff8eb] p-3 text-xs text-[#b54708]" role="alert">{c.failed} {failures.join(", ")}</p> : null}
    {error ? <ErrorState message={error} /> : loading ? <div className="ux-state"><p>…</p></div> : visible.length ? <div className="table-wrap mt-4"><table className="data-table"><thead><tr><th /><th>{c.number}</th><th>{c.date}</th><th>{c.party}</th><th className="numeric">{c.amount}</th></tr></thead><tbody>{visible.map((row) => <tr key={String(row.id)} className="cursor-pointer" onClick={() => toggle(String(row.id))}><td><input type="checkbox" checked={selected.has(String(row.id))} onChange={() => toggle(String(row.id))} onClick={(event) => event.stopPropagation()} aria-label={numberOf(kind, row)} /></td><td>{numberOf(kind, row)}{kind === "invoices" ? <small className="muted block">{documentTypeLabel(resolveCommercialDocumentType(row), lang)}</small> : null}</td><td>{dateOf(kind, row)}</td><td>{partyOf(kind, row) || "—"}</td><td className="numeric">{money(amountOf(kind, row))}</td></tr>)}</tbody></table></div> : <p className="muted rounded-lg border border-dashed p-8 text-center text-sm">{c.empty}</p>}
  </div>;
}
