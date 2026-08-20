"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, MoreHorizontal, Plus, Search, X } from "lucide-react";
import type { InvoiceRow } from "@/lib/models";
import { money, shortDate } from "@/lib/format";
import { EmptyState, ErrorState, LoadingSkeleton, MetricCard, MobileListCard, PageHeader, StatusBadge } from "./ui";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { listInvoices } from "@invoice-monorepo/api/repositories";
import { documentTypeLabel, resolveCommercialDocumentType } from "@invoice-monorepo/commercial-documents";

const tabs = ["all", "draft", "sent", "partial", "paid", "overdue", "cancelled"] as const;
type InvoiceTab = (typeof tabs)[number];

function canonicalStatus(invoice: InvoiceRow) { return String(invoice.commercial_status || invoice.status || "DRAFT").toUpperCase(); }
function listStatus(invoice: InvoiceRow) { const status = canonicalStatus(invoice); return status === "ISSUED" ? "sent" : status === "PARTIALLY_PAID" ? "partial" : status.toLowerCase(); }

export function InvoiceList({ type = "invoice" }: { type?: "invoice" | "offer" }) {
  return <Suspense fallback={<div className="ux-page"><LoadingSkeleton rows={6} /></div>}><InvoiceListContent type={type} /></Suspense>;
}

function InvoiceListContent({ type = "invoice" }: { type?: "invoice" | "offer" }) {
  const searchParams = useSearchParams();
  const workspace = useWorkspace();
  const [fetched, setFetched] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const supabase = createClient();
      if (!supabase) { setFetched([]); setError("Supabase is not configured."); setLoading(false); return; }
      if (workspace.loading) return;
      if (!workspace.user || !workspace.companyIds.length) { setFetched([]); setLoading(false); return; }
      try {
        const rows = await listInvoices(supabase, { userId: workspace.user.id, companyIds: workspace.companyIds }, type === "offer" ? { documentType: "QUOTE", legacyType: "offer" } : undefined);
        if (!cancelled) setFetched(rows as unknown as InvoiceRow[]);
      } catch (requestError) {
        if (!cancelled) { setFetched([]); setError(requestError instanceof Error ? requestError.message : "Unable to load invoices."); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [type, workspace.companyIds, workspace.loading, workspace.user]);
  const source = useMemo(() => fetched.filter((row) => type === "invoice" ? resolveCommercialDocumentType(row) !== "QUOTE" : resolveCommercialDocumentType(row) === "QUOTE"), [fetched, type]);
  const requestedStatus = searchParams.get("status");
  const [active, setActive] = useState<InvoiceTab>(() => requestedStatus && tabs.includes(requestedStatus as InvoiceTab) ? requestedStatus as InvoiceTab : "all");
  const [invoiceType, setInvoiceType] = useState("all");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minimum, setMinimum] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const perPage = 10;

  useEffect(() => {
    if (requestedStatus && tabs.includes(requestedStatus as InvoiceTab)) {
      queueMicrotask(() => setActive(requestedStatus as InvoiceTab));
    }
  }, [requestedStatus]);

  const filtered = useMemo(() => source.filter((invoice) => {
    const haystack = `${invoice.invoice_number} ${invoice.client?.name || ""}`.toLowerCase();
    const documentType = resolveCommercialDocumentType(invoice);
    return (active === "all" || listStatus(invoice) === active)
      && (invoiceType === "all" || (invoiceType === "recurring" ? Boolean((invoice as InvoiceRow & { recurring_interval?: string }).recurring_interval) : invoiceType === "invoice" ? documentType === "INVOICE" : invoiceType === "offer" ? documentType === "QUOTE" : invoiceType === "proforma" ? documentType === "PROFORMA" : invoiceType === "order" ? documentType === "SALES_ORDER" : documentType === invoiceType.toUpperCase()))
      && haystack.includes(query.trim().toLowerCase())
      && (!from || invoice.issue_date >= from)
      && (!to || invoice.issue_date <= to)
      && (!minimum || Number(invoice.total_amount) >= Number(minimum));
  }).sort((left, right) => {
    const leftDate = String(left.issue_date || left.created_at || "");
    const rightDate = String(right.issue_date || right.created_at || "");
    return sortOrder === "desc" ? rightDate.localeCompare(leftDate) : leftDate.localeCompare(rightDate);
  }), [active, from, invoiceType, minimum, query, sortOrder, source, to]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const rows = filtered.slice((page - 1) * perPage, page * perPage);
  const total = source.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const paid = source.filter((row) => canonicalStatus(row) === "PAID" || Number(row.amount_received || 0) >= Number(row.total_amount || 0)).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const outstanding = source.filter((row) => !["PAID", "CANCELLED"].includes(canonicalStatus(row))).reduce((sum, row) => sum + Math.max(0, Number(row.total_amount || 0) - Number(row.amount_received || 0)), 0);
  const overdue = source.filter((row) => canonicalStatus(row) === "OVERDUE").reduce((sum, row) => sum + Math.max(0, Number(row.total_amount || 0) - Number(row.amount_received || 0)), 0);

  function updateFilters() { setPage(1); }
  function clearFilters() { setFrom(""); setTo(""); setMinimum(""); setInvoiceType("all"); setQuery(""); setActive("all"); setPage(1); }
  function exportCsv() {
    const lines = [["Number", "Customer", "Issue date", "Due date", "Amount", "Status"], ...filtered.map((row) => [row.invoice_number, row.client?.name || "", row.issue_date, row.due_date || "", row.total_amount, row.status])];
    const blob = new Blob([lines.map((line) => line.map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `operix-${type}s-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const title = type === "invoice" ? "Invoices" : "Quotes";
  const singular = type === "invoice" ? "invoice" : "quote";
  const newHref = type === "invoice" ? "/invoices/new" : "/invoices/new?type=offer";

  return <div className="invoice-list-page">
    <PageHeader title={title} description={type === "invoice" ? "Create, send, and keep track of every customer invoice." : "Prepare proposals and turn approved quotes into invoices."} actions={<><Link href={newHref} className="btn btn-primary"><Plus size={16} /> New {type === "invoice" ? "invoice" : "quote"}</Link>{type === "offer" && source.length ? <Link href={`/invoices/new?convert=${source[0].id}`} className="btn">Convert quote</Link> : null}</>} />
    <section className="invoice-list-summary" aria-label={`${title} summary`}>
      <MetricCard label={`Total ${type === "invoice" ? "invoiced" : "quoted"}`} value={money(total)} icon={FileText} />
      <MetricCard label="Paid" value={money(paid)} icon={FileText} tone="green" />
      <MetricCard label="Outstanding" value={money(outstanding)} icon={MoreHorizontal} tone="amber" />
      <MetricCard label="Overdue" value={money(overdue)} icon={MoreHorizontal} tone="red" />
    </section>
    <div className="invoice-list-toolbar">
      <label className="ux-search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">Search {title.toLowerCase()}</span><input value={query} onChange={(event) => { setQuery(event.target.value); updateFilters(); }} placeholder={`Search ${title.toLowerCase()}…`} /></label>
      <select aria-label={`Filter ${title.toLowerCase()} type`} className="select invoice-type-filter" value={invoiceType} onChange={(event) => { setInvoiceType(event.target.value); updateFilters(); }}><option value="all">All types</option><option value="invoice">Invoices</option><option value="offer">Quotes</option><option value="proforma">Proforma</option><option value="order">Orders</option><option value="recurring">Recurring</option></select>
      <select aria-label={`Sort ${title.toLowerCase()}`} className="select invoice-sort-filter" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "desc" | "asc")}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select>
      <button type="button" className={`ux-filter-button invoice-filter-trigger ${filtersOpen ? "is-active" : ""}`} onClick={() => setFiltersOpen((value) => !value)}>{filtersOpen ? <X size={16} /> : <MoreHorizontal size={16} />} Filters{active !== "all" || from || to || minimum ? " · Active" : ""}</button>
      <button type="button" className="ux-filter-button invoice-export-trigger" onClick={exportCsv}><Download size={16} /> Export</button>
      <div className="invoice-status-tabs" aria-label={`${title} status`}>
        {tabs.map((tab) => <button type="button" key={tab} className={`invoice-status-tab ${active === tab ? "is-active" : ""}`} onClick={() => { setActive(tab); setPage(1); }}>{tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}
      </div>
    </div>
    {filtersOpen ? <div className="invoice-filter-surface"><div className="invoice-filter-sheet-title"><strong>Filter {title.toLowerCase()}</strong><button type="button" className="icon-btn" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={17} /></button></div><div className="invoice-filter-sheet-grid"><label className="field"><span>From</span><input className="input" type="date" value={from} onChange={(event) => { setFrom(event.target.value); updateFilters(); }} /></label><label className="field"><span>To</span><input className="input" type="date" value={to} onChange={(event) => { setTo(event.target.value); updateFilters(); }} /></label><label className="field"><span>Minimum amount</span><input className="input" type="number" min="0" placeholder="€0.00" value={minimum} onChange={(event) => { setMinimum(event.target.value); updateFilters(); }} /></label></div><div className="invoice-filter-actions"><button type="button" className="btn" onClick={clearFilters}>Clear filters</button><button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>Show {filtered.length} results</button></div></div> : null}
    {error ? <ErrorState message={error} /> : null}
    {!loading && !error && !source.length ? <section className="ux-section-card"><EmptyState title={`No ${title.toLowerCase()} yet`} description={`Create your first ${singular} to start building your sales history.`} actionLabel={`New ${singular}`} actionHref={newHref} icon={FileText} /></section> : null}
    {loading ? <section className="ux-section-card"><LoadingSkeleton rows={6} /></section> : null}
    {!loading && !error && source.length ? <>
      <section className="ux-section-card invoice-list-table-wrap">
        {rows.length ? <table className="invoice-list-table"><thead><tr><th>{type === "invoice" ? "Document" : "Quote"}</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((invoice) => <InvoiceTableRow key={invoice.id} invoice={invoice} canEdit={workspace.roleCode !== "employee"} />)}</tbody></table> : <EmptyState title="No matching documents" description="Try changing the search or filters." actionLabel="Clear filters" onAction={clearFilters} icon={Search} />}
        <ListFooter page={page} pages={pages} count={filtered.length} label={type === "invoice" ? "invoices" : "quotes"} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(pages, value + 1))} />
      </section>
      <section className="invoice-mobile-cards">{rows.length ? rows.map((invoice) => <MobileListCard key={invoice.id} href={`/invoices/${invoice.id}`} icon={FileText} title={invoice.invoice_number} subtitle={`${documentTypeLabel(resolveCommercialDocumentType(invoice), "en")} · ${invoice.client?.name || "Citizen"}`} meta={`${shortDate(invoice.issue_date)}${invoice.due_date ? ` · Due ${shortDate(invoice.due_date)}` : ""}`} amount={money(invoice.total_amount, invoice.currency)} status={canonicalStatus(invoice)} />) : <EmptyState title="No matching documents" description="Try changing the search or filters." actionLabel="Clear filters" onAction={clearFilters} icon={Search} />}<ListFooter page={page} pages={pages} count={filtered.length} label={type === "invoice" ? "invoices" : "quotes"} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(pages, value + 1))} /></section>
    </> : null}
  </div>;
}

function InvoiceTableRow({ invoice, canEdit }: { invoice: InvoiceRow; canEdit: boolean }) {
  const router = useRouter();
  const type = resolveCommercialDocumentType(invoice);
  return <tr tabIndex={0} onClick={() => router.push(`/invoices/${invoice.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(`/invoices/${invoice.id}`); } }}><td><Link href={`/invoices/${invoice.id}`} onClick={(event) => event.stopPropagation()}><strong>{invoice.invoice_number}</strong></Link><small className="muted block">{documentTypeLabel(type, "en")}</small></td><td><span className="invoice-customer"><strong>{invoice.client?.name || "Citizen"}</strong><small>{invoice.client_id ? "Customer record" : "Walk-in customer"}</small></span></td><td>{shortDate(invoice.issue_date)}</td><td><strong>{money(invoice.total_amount, invoice.currency)}</strong></td><td><StatusBadge status={canonicalStatus(invoice)} /></td><td><details className="relative" onClick={(event) => event.stopPropagation()}><summary className="icon-btn list-none" aria-label={`Actions for ${invoice.invoice_number}`}><MoreHorizontal size={17} /></summary><div className="action-menu"><Link href={`/invoices/${invoice.id}`}>View document</Link>{canEdit && (type === "INVOICE" || type === "QUOTE") ? <Link href={`/invoices/new?edit=${invoice.id}`}>Edit</Link> : null}<Link href={`/invoices/preview/${encodeURIComponent(invoice.invoice_number)}`}>Preview PDF</Link></div></details></td></tr>;
}

function ListFooter({ page, pages, count, label, onPrevious, onNext }: { page: number; pages: number; count: number; label: string; onPrevious: () => void; onNext: () => void }) {
  return <footer className="list-footer"><span>Showing {count ? (page - 1) * 10 + 1 : 0}–{Math.min(page * 10, count)} of {count} {label}</span><span className="list-footer-controls"><button type="button" className="icon-btn" disabled={page === 1} onClick={onPrevious} aria-label="Previous page">‹</button><strong>{page}</strong><button type="button" className="icon-btn" disabled={page === pages} onClick={onNext} aria-label="Next page">›</button></span></footer>;
}
