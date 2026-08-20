"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  BarChart3,
  Boxes,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  HandCoins,
  Landmark,
  ReceiptText,
  Scale,
  Share2,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";
import { ErrorState, MetricCard, PageHeader, SectionCard } from "./ui";
import { createSalesBookAmendment, ensureSalesBookPeriod, listSalesBookPeriods, listSalesBookTransactions, markSalesBookDeclared, type SalesBookPeriodRow } from "@invoice-monorepo/api/repositories";

type Summary = {
  revenue: number;
  expenses: number;
  net_profit: number;
  assets: number;
  liabilities_equity: number;
  cash_flow: number;
  ar_outstanding: number;
  ap_outstanding: number;
};

type ReportRow = Record<string, unknown>;

type ReportCard = {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

const accountingReports: ReportCard[] = [
  { label: "Trial Balance", description: "Debit and credit control", href: "#trial-balance", icon: Scale },
  { label: "Profit & Loss", description: "Revenue, expenses and result", href: "#profit-loss", icon: TrendingUp },
  { label: "Balance Sheet", description: "Assets, liabilities and equity", href: "#balance-sheet", icon: BarChart3 },
  { label: "Cash Flow", description: "Cash and bank movement", href: "#cash-flow", icon: HandCoins },
  { label: "Changes in Equity", description: "Owner and retained equity", href: "#equity", icon: ArrowDownUp },
  { label: "General Ledger", description: "Every posted account line", href: "/accounting", icon: FileText },
  { label: "Asset Register", description: "Fixed assets and depreciation", href: "#assets", icon: Landmark },
  { label: "Inventory Register", description: "Stock cost and quantities", href: "/inventory", icon: Boxes },
  { label: "Receivables Aging", description: "Customer balances by due date", href: "#receivables", icon: Users },
  { label: "Payables Aging", description: "Supplier balances by due date", href: "#payables", icon: Users },
];

const taxReports: ReportCard[] = [
  { label: "Sales Book", description: "Posted sales and output VAT", href: "#sales-book", icon: ReceiptText },
  { label: "Purchase Book", description: "Supplier invoices and input VAT", href: "#purchase-book", icon: FileCheck2 },
  { label: "Cash & Payments", description: "Cash-book and bank movements", href: "#cash-flow", icon: WalletCards },
  { label: "Payroll", description: "Payroll and statutory controls", href: "/payroll", icon: Landmark },
  { label: "Declarations", description: "Preview and export status", href: "#declarations", icon: FileText },
];

const emptySummary: Summary = { revenue: 0, expenses: 0, net_profit: 0, assets: 0, liabilities_equity: 0, cash_flow: 0, ar_outstanding: 0, ap_outstanding: 0 };

function numberValue(row: ReportRow, key: string) {
  const value = row[key];
  return typeof value === "number" ? value : Number(value || 0);
}

function salesBookPeriodLabel(period: Pick<SalesBookPeriodRow, "period_start" | "reporting_frequency">) {
  const start = period.period_start.slice(0, 10);
  const year = start.slice(0, 4);
  const month = Number(start.slice(5, 7));
  const frequency = String(period.reporting_frequency || "monthly").toLowerCase();
  if (frequency === "annual") return year;
  if (frequency === "quarterly") return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T00:00:00Z`));
}

function salesBookStatusLabel(status: SalesBookPeriodRow["status"]) {
  return {
    OPEN: "Open",
    READY_FOR_DECLARATION: "Ready for declaration",
    DECLARED: "Declared",
    AMENDED: "Amended",
  }[status];
}

function reportCardGrid(cards: ReportCard[]) {
  return <section className="reports-category-grid">{cards.map((card) => {
    const Icon = card.icon;
    return <Link key={card.label} href={card.href} className="reports-category-card"><span className="reports-category-icon"><Icon size={19} /></span><span><strong>{card.label}</strong><small>{card.description}</small></span><span className="reports-category-arrow">›</span></Link>;
  })}</section>;
}

export function ReportsView() {
  const router = useRouter();
  const workspace = useWorkspace();
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [profitLoss, setProfitLoss] = useState<ReportRow[]>([]);
  const [trialBalance, setTrialBalance] = useState<ReportRow[]>([]);
  const [salesBook, setSalesBook] = useState<ReportRow[]>([]);
  const [salesBookPeriods, setSalesBookPeriods] = useState<SalesBookPeriodRow[]>([]);
  const [selectedSalesBookPeriodId, setSelectedSalesBookPeriodId] = useState<string | null>(null);
  const [salesBookYearFilter, setSalesBookYearFilter] = useState("ALL");
  const [salesBookStatusFilter, setSalesBookStatusFilter] = useState<"ALL" | SalesBookPeriodRow["status"]>("ALL");
  const [salesBookLoading, setSalesBookLoading] = useState(true);
  const [salesBookError, setSalesBookError] = useState("");
  const [salesBookApplicable, setSalesBookApplicable] = useState(true);
  const [salesBookConfigured, setSalesBookConfigured] = useState(true);
  const [amendmentVisible, setAmendmentVisible] = useState(false);
  const [amendmentInvoiceId, setAmendmentInvoiceId] = useState("");
  const [amendmentReason, setAmendmentReason] = useState("");
  const [savingSalesBookAction, setSavingSalesBookAction] = useState(false);
  const [reconciliation, setReconciliation] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    if (workspace.loading) return;
    if (!workspace.companyIds.length) {
      setSummary(emptySummary);
      setSalesBook([]);
      setLoading(false);
      return;
    }
    const [summaryResult, profitLossResult, trialBalanceResult, reconciliationResult] = await Promise.all([
      supabase.from("operix_report_summary").select("*").in("company_id", workspace.companyIds),
      supabase.from("operix_profit_loss").select("*").in("company_id", workspace.companyIds).order("period_start", { ascending: false }).limit(100),
      supabase.from("operix_trial_balance").select("*").in("company_id", workspace.companyIds).order("account_code").limit(100),
      supabase.from("operix_financial_reconciliation").select("*").in("company_id", workspace.companyIds),
    ]);
    const queryError = summaryResult.error || profitLossResult.error || trialBalanceResult.error || reconciliationResult.error;
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }
    const nextSummary = (summaryResult.data || []).reduce<Summary>((result, row) => ({
      revenue: result.revenue + numberValue(row, "revenue"),
      expenses: result.expenses + numberValue(row, "expenses"),
      net_profit: result.net_profit + numberValue(row, "net_profit"),
      assets: result.assets + numberValue(row, "assets"),
      liabilities_equity: result.liabilities_equity + numberValue(row, "liabilities_equity"),
      cash_flow: result.cash_flow + numberValue(row, "cash_flow"),
      ar_outstanding: result.ar_outstanding + numberValue(row, "ar_outstanding"),
      ap_outstanding: result.ap_outstanding + numberValue(row, "ap_outstanding"),
    }), emptySummary);
    setSummary(nextSummary);
    setProfitLoss((profitLossResult.data || []) as ReportRow[]);
    setTrialBalance((trialBalanceResult.data || []) as ReportRow[]);
    setReconciliation((reconciliationResult.data || [])[0] as ReportRow | undefined || null);
    setLoading(false);
  }, [workspace.companyIds, workspace.loading]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  const loadSalesBookPeriods = useCallback(async () => {
    const supabase = createClient();
    if (!supabase || workspace.loading) return;
    if (!workspace.companyIds.length) { setSalesBookPeriods([]); setSelectedSalesBookPeriodId(null); setSalesBook([]); setSalesBookLoading(false); return; }
    setSalesBookLoading(true);
    setSalesBookError("");
    const registeredCompanies = workspace.companies.filter((company) => String(company.vat_registration_status || "").toLowerCase() === "registered");
    setSalesBookApplicable(registeredCompanies.length > 0);
    const configured = registeredCompanies.every((company) => ["monthly", "quarterly", "annual"].includes(String(company.accounting_period_frequency || "").toLowerCase()));
    setSalesBookConfigured(configured);
    if (!registeredCompanies.length || !configured) {
      setSalesBookPeriods([]);
      setSelectedSalesBookPeriodId(null);
      setSalesBook([]);
      setSalesBookLoading(false);
      return;
    }
    try {
      await Promise.all(registeredCompanies.map((company) => ensureSalesBookPeriod(supabase, company.id)));
      const nextPeriods = await listSalesBookPeriods(supabase, workspace.companyIds);
      setSalesBookPeriods(nextPeriods);
      setSelectedSalesBookPeriodId((current) => current && nextPeriods.some((period) => period.id === current) ? current : nextPeriods[0]?.id || null);
    } catch (periodError) {
      setSalesBookPeriods([]);
      setSelectedSalesBookPeriodId(null);
      setSalesBook([]);
      setSalesBookError(periodError instanceof Error ? periodError.message : "The Sales Book periods could not be loaded.");
    } finally {
      setSalesBookLoading(false);
    }
  }, [workspace.companies, workspace.companyIds, workspace.loading]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSalesBookPeriods(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSalesBookPeriods]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedSalesBookPeriodId || !workspace.companyIds.length) { setSalesBook([]); return; }
      const supabase = createClient();
      if (!supabase) return;
      setSalesBookLoading(true);
      void listSalesBookTransactions(supabase, workspace.companyIds, selectedSalesBookPeriodId)
        .then((rows) => setSalesBook(rows as ReportRow[]))
        .catch((transactionError) => setSalesBookError(transactionError instanceof Error ? transactionError.message : "The Sales Book transactions could not be loaded."))
        .finally(() => setSalesBookLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedSalesBookPeriodId, workspace.companyIds]);

  const salesBookYears = useMemo(() => Array.from(new Set(salesBookPeriods.map((period) => period.period_start.slice(0, 4)))), [salesBookPeriods]);
  const visibleSalesBookPeriods = useMemo(() => salesBookPeriods.filter((period) => {
    const yearMatches = salesBookYearFilter === "ALL" || period.period_start.slice(0, 4) === salesBookYearFilter;
    const statusMatches = salesBookStatusFilter === "ALL" || period.status === salesBookStatusFilter;
    return yearMatches && statusMatches;
  }), [salesBookPeriods, salesBookStatusFilter, salesBookYearFilter]);
  const selectedSalesBookPeriod = visibleSalesBookPeriods.find((period) => period.id === selectedSalesBookPeriodId) || visibleSalesBookPeriods[0] || null;
  const salesBookCurrency = String(workspace.company?.currency || workspace.profile?.currency || "EUR");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextId = visibleSalesBookPeriods.some((period) => period.id === selectedSalesBookPeriodId)
        ? selectedSalesBookPeriodId
        : visibleSalesBookPeriods[0]?.id || null;
      if (nextId !== selectedSalesBookPeriodId) setSelectedSalesBookPeriodId(nextId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedSalesBookPeriodId, visibleSalesBookPeriods]);

  const canManageSalesBook = ["super_administrator", "company_administrator", "manager"].includes(workspace.roleCode);

  async function declareSalesBook() {
    if (!selectedSalesBookPeriod || selectedSalesBookPeriod.status !== "READY_FOR_DECLARATION" || !canManageSalesBook || !window.confirm("Declare this Sales Book period? This locks the period and future corrections require an audited amendment.")) return;
    const supabase = createClient();
    if (!supabase) return;
    setSavingSalesBookAction(true);
    try { await markSalesBookDeclared(supabase, selectedSalesBookPeriod.id); await loadSalesBookPeriods(); }
    catch (actionError) { setSalesBookError(actionError instanceof Error ? actionError.message : "The Sales Book could not be declared."); }
    finally { setSavingSalesBookAction(false); }
  }

  async function startSalesBookAmendment() {
    if (!selectedSalesBookPeriod || !amendmentInvoiceId || !amendmentReason.trim() || !canManageSalesBook) return;
    const supabase = createClient();
    if (!supabase) return;
    setSavingSalesBookAction(true);
    try {
      const amendment = await createSalesBookAmendment(supabase, selectedSalesBookPeriod.id, amendmentInvoiceId, amendmentReason.trim());
      const amendmentId = typeof amendment?.id === "string" ? amendment.id : "";
      if (!amendmentId) throw new Error("The Sales Book amendment did not return an identifier.");
      setAmendmentVisible(false);
      setAmendmentReason("");
      router.push(`/invoices/new?edit=${amendmentInvoiceId}&salesBookAmendment=${amendmentId}&documentType=INVOICE`);
    } catch (actionError) { setSalesBookError(actionError instanceof Error ? actionError.message : "The Sales Book amendment could not be started."); }
    finally { setSavingSalesBookAction(false); }
  }

  async function shareSalesBookSummary() {
    if (!selectedSalesBookPeriod) return;
    const text = `Sales Book — ${salesBookPeriodLabel(selectedSalesBookPeriod)}\n${selectedSalesBookPeriod.period_start} – ${selectedSalesBookPeriod.period_end}\n${salesBookStatusLabel(selectedSalesBookPeriod.status)}\nTaxable sales: ${money(numberValue(selectedSalesBookPeriod, "taxable_amount"), salesBookCurrency)} · VAT: ${money(numberValue(selectedSalesBookPeriod, "vat_amount"), salesBookCurrency)} · Total: ${money(numberValue(selectedSalesBookPeriod, "total_amount"), salesBookCurrency)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Sales Book", text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setSalesBookError("The Sales Book summary was copied to the clipboard.");
      } else {
        setSalesBookError("Sharing is not available in this browser. Use Export instead.");
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setSalesBookError(shareError instanceof Error ? shareError.message : "The Sales Book summary could not be shared.");
    }
  }

  function exportCsv() {
    const rows = salesBook.length ? salesBook : profitLoss.length ? profitLoss : trialBalance;
    const columns = rows.length ? Object.keys(rows[0]) : ["status"];
    const csvRows = [columns, ...rows.map((row) => columns.map((column) => String(row[column] ?? "")))];
    const blob = new Blob([csvRows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `operix-accounting-report-${selectedSalesBookPeriod?.period_start || new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading || workspace.loading) {
    return <div className="ux-page reports-page"><PageHeader title="Reports" description="Financial statements generated from posted accounting entries." /><div className="ux-state"><p>Loading accounting reports…</p></div></div>;
  }
  if (error) {
    return <div className="ux-page reports-page"><PageHeader title="Reports" description="Financial statements generated from posted accounting entries." /><ErrorState message={error} onRetry={() => void loadReports()} /></div>;
  }

  return <div className="ux-page reports-page">
    <PageHeader title="Reports" description="Financial statements generated from the accounting engine across the selected company group." actions={<button type="button" className="btn" onClick={exportCsv}><Download size={16} /> Export</button>} />
    <section className="ux-metric-grid reports-metrics">
      <MetricCard label="Revenue" value={money(summary.revenue)} icon={BarChart3} tone="blue" />
      <MetricCard label="Expenses" value={money(summary.expenses)} icon={WalletCards} tone="red" />
      <MetricCard label="Net profit" value={money(summary.net_profit)} icon={HandCoins} tone={summary.net_profit >= 0 ? "green" : "red"} />
      <MetricCard label="Receivables" value={money(summary.ar_outstanding)} icon={ReceiptText} tone="amber" />
      <MetricCard label="Payables" value={money(summary.ap_outstanding)} icon={FileText} tone="slate" />
    </section>
    {reportCardGrid(accountingReports)}
    <SectionCard title="Control status" description="A production report is only trustworthy when its accounting controls reconcile." className="reports-chart-card">
      <div className="reports-control-row"><CheckCircle2 size={18} /><strong>{reconciliation?.reconciles ? "All local reconciliation checks pass" : "Reconciliation requires attention"}</strong><span>{reconciliation?.reconciles ? "Trial balance, subledgers, VAT, inventory, assets and cash are aligned." : "Review the reconciliation details before relying on reported balances."}</span></div>
    </SectionCard>
    <SectionCard title="Profit & Loss" description="Monthly account presentation from posted general-ledger lines." className="reports-chart-card">
      <div className="reports-table-wrap" id="profit-loss"><table className="ux-table"><thead><tr><th>Period</th><th>Account</th><th>Type</th><th className="numeric">Amount</th></tr></thead><tbody>{profitLoss.slice(0, 20).map((row, index) => <tr key={`${String(row.account_id)}-${String(row.period_start)}-${index}`}><td>{String(row.period_start || "—")}</td><td>{String(row.account_name || row.account_code || "—")}</td><td>{String(row.account_type || "—")}</td><td className="numeric">{money(numberValue(row, "presentation_amount"))}</td></tr>)}{profitLoss.length === 0 ? <tr><td colSpan={4}>No posted profit-and-loss entries.</td></tr> : null}</tbody></table></div>
    </SectionCard>
    <SectionCard title="Trial Balance" description="The debit and credit control behind every financial statement." className="reports-chart-card">
      <div className="reports-table-wrap" id="trial-balance"><table className="ux-table"><thead><tr><th>Account</th><th>Type</th><th className="numeric">Debit</th><th className="numeric">Credit</th><th className="numeric">Balance</th></tr></thead><tbody>{trialBalance.slice(0, 20).map((row, index) => <tr key={`${String(row.account_id)}-${index}`}><td>{String(row.account_name || row.account_code || "—")}</td><td>{String(row.account_type || "—")}</td><td className="numeric">{money(numberValue(row, "total_debit"))}</td><td className="numeric">{money(numberValue(row, "total_credit"))}</td><td className="numeric">{money(numberValue(row, "balance"))}</td></tr>)}{trialBalance.length === 0 ? <tr><td colSpan={5}>No posted trial-balance entries.</td></tr> : null}</tbody></table></div>
    </SectionCard>
    <section id="tax-books"><h2 className="ux-section-heading">Tax center</h2><p className="ux-section-description">Tax books and declaration preparation remain linked to posted source data. Electronic submission is not represented here.</p>{reportCardGrid(taxReports)}</section>
    <div id="sales-book"><SectionCard title="Sales Book" description="Posted sales and output VAT from the Kosovo Sales Book period lifecycle. Cancelled, reversed, and unposted documents are excluded by the database view." className="reports-chart-card">
      {!salesBookApplicable ? <div className="mb-4 rounded-lg border border-[#dbe5f5] bg-[#f8fbff] p-4 text-xs"><strong>Sales Book not applicable</strong><p className="muted mt-1">No company in this workspace is registered for VAT.</p></div> : null}
      {salesBookApplicable && !salesBookConfigured ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><strong>Sales Book configuration required</strong><p className="mt-1">Set a supported VAT reporting frequency before preparing a Kosovo Sales Book.</p></div> : null}
      {salesBookError ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{salesBookError}</div> : null}
      {salesBookPeriods.length > 0 ? <div className="mb-4 flex flex-wrap items-end gap-2" aria-label="Sales Book filters">
        <label className="field min-w-40"><span>Year</span><select aria-label="Sales Book year" className="select" value={salesBookYearFilter} onChange={(event) => setSalesBookYearFilter(event.target.value)}><option value="ALL">All years</option>{salesBookYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <label className="field min-w-52"><span>Status</span><select aria-label="Sales Book status" className="select" value={salesBookStatusFilter} onChange={(event) => setSalesBookStatusFilter(event.target.value as "ALL" | SalesBookPeriodRow["status"])}><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="READY_FOR_DECLARATION">Ready for declaration</option><option value="DECLARED">Declared</option><option value="AMENDED">Amended</option></select></label>
        <span className="muted pb-2 text-xs">{visibleSalesBookPeriods.length} period{visibleSalesBookPeriods.length === 1 ? "" : "s"}</span>
      </div> : null}
      {selectedSalesBookPeriod ? <>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="muted text-xs">Selected period</p><p className="text-sm font-semibold">{salesBookPeriodLabel(selectedSalesBookPeriod)} · {selectedSalesBookPeriod.period_start} – {selectedSalesBookPeriod.period_end}</p><p className="muted mt-1 text-xs">Status: {salesBookStatusLabel(selectedSalesBookPeriod.status)} · Declaration deadline: {selectedSalesBookPeriod.declaration_deadline}</p></div><div className="flex flex-wrap gap-2"><select aria-label="Sales Book period" className="select" value={selectedSalesBookPeriod.id} onChange={(event) => setSelectedSalesBookPeriodId(event.target.value)}>{visibleSalesBookPeriods.map((period) => <option key={period.id} value={period.id}>{salesBookPeriodLabel(period)} · {salesBookStatusLabel(period.status)}</option>)}</select><button type="button" className="btn" onClick={() => void shareSalesBookSummary}><Share2 size={16} /> Share</button>{selectedSalesBookPeriod.status === "READY_FOR_DECLARATION" && canManageSalesBook ? <button type="button" className="btn btn-primary" onClick={() => void declareSalesBook()} disabled={savingSalesBookAction}>{savingSalesBookAction ? "Saving…" : "Declare period"}</button> : null}{["DECLARED", "AMENDED"].includes(selectedSalesBookPeriod.status) && canManageSalesBook ? <button type="button" className="btn" onClick={() => { setAmendmentInvoiceId(""); setAmendmentReason(""); setAmendmentVisible(true); }}>Start amendment</button> : null}</div></div>
        <div className="ux-metric-grid reports-metrics mb-4"><MetricCard label="Sales without VAT" value={money(numberValue(selectedSalesBookPeriod, "taxable_amount"), salesBookCurrency)} icon={ReceiptText} tone="slate" /><MetricCard label="Output VAT" value={money(numberValue(selectedSalesBookPeriod, "vat_amount"), salesBookCurrency)} icon={Scale} tone="amber" /><MetricCard label="Total sales" value={money(numberValue(selectedSalesBookPeriod, "total_amount"), salesBookCurrency)} icon={TrendingUp} tone="green" /><MetricCard label="Documents" value={String(numberValue(selectedSalesBookPeriod, "transaction_count"))} icon={FileText} tone="blue" /></div>
        {selectedSalesBookPeriod.status === "DECLARED" || selectedSalesBookPeriod.status === "AMENDED" ? <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">This period is locked. Corrections must use the audited amendment workflow.</p> : null}
      </> : null}
      <div className="reports-table-wrap"><table className="ux-table"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>VAT class</th><th className="numeric">Taxable base</th><th className="numeric">Output VAT</th><th className="numeric">Total</th></tr></thead><tbody>{salesBook.slice(0, 100).map((row, index) => <tr key={`${String(row.invoice_id)}-${index}`}><td><Link className="text-[#004ffe]" href={`/invoices/${String(row.invoice_id)}`}>{String(row.invoice_number || "—")}</Link>{row.is_credit_note ? <small className="ml-1 text-[#b42318]">Credit</small> : null}</td><td>{String(row.invoice_date || "—")}</td><td>{String(row.customer_name || "Walk-in customer")}{row.customer_fiscal_number ? <small className="muted block">{String(row.customer_fiscal_number)}</small> : null}</td><td>{String(row.vat_classification || "—")} · {numberValue(row, "vat_rate")}%</td><td className="numeric">{money(numberValue(row, "taxable_base"), String(row.currency || workspace.company?.currency || workspace.profile?.currency || "EUR"))}</td><td className="numeric">{money(numberValue(row, "output_vat"), String(row.currency || workspace.company?.currency || workspace.profile?.currency || "EUR"))}</td><td className="numeric">{money(numberValue(row, "total_amount"), String(row.currency || workspace.company?.currency || workspace.profile?.currency || "EUR"))}</td></tr>)}{!salesBookLoading && salesBook.length === 0 ? <tr><td colSpan={7}>{selectedSalesBookPeriod ? "No posted sales in this period." : "No Sales Book period is available."}</td></tr> : null}</tbody></table></div>
      {salesBookLoading ? <p className="muted mt-3 text-xs">Loading Sales Book transactions…</p> : null}{salesBook.length > 100 ? <p className="muted mt-3 text-xs">Showing the first 100 of {salesBook.length} posted sales. Use Export for the selected period.</p> : null}
    </SectionCard></div>
    <SectionCard title="EFS status" description="Fiscalization certification is separate from ordinary invoicing." className="reports-chart-card"><div className="reports-control-row"><FileCheck2 size={18} /><strong>EFS NOT CERTIFIED</strong><span>Do not use a normal OperiX invoice as a certified fiscal receipt.</span></div></SectionCard>
    <div id="balance-sheet" /><div id="cash-flow" /><div id="equity" /><div id="assets" /><div id="receivables" /><div id="payables" /><div id="purchase-book" /><div id="declarations" />
    {amendmentVisible ? <div className="resource-modal-backdrop" onMouseDown={() => setAmendmentVisible(false)}><section className="resource-modal" role="dialog" aria-modal="true" aria-labelledby="sales-book-amendment-title" onMouseDown={(event) => event.stopPropagation()}><header className="resource-modal-header"><div><h2 id="sales-book-amendment-title">Start Sales Book amendment</h2><p>Select the affected invoice and record the reason before editing.</p></div><button type="button" className="icon-btn" onClick={() => setAmendmentVisible(false)} aria-label="Close amendment dialog">×</button></header><div className="resource-modal-fields"><label className="field"><span>Affected invoice</span><select className="select" value={amendmentInvoiceId} onChange={(event) => setAmendmentInvoiceId(event.target.value)}><option value="">Select invoice</option>{salesBook.filter((row) => row.invoice_id).map((row) => <option key={String(row.invoice_id)} value={String(row.invoice_id)}>{String(row.invoice_number || row.invoice_id)} · {String(row.customer_name || "Walk-in customer")}</option>)}</select></label><label className="field"><span>Reason</span><textarea className="textarea min-h-28" value={amendmentReason} onChange={(event) => setAmendmentReason(event.target.value)} placeholder="Explain the correction" /></label></div><footer className="resource-modal-footer"><button type="button" className="btn" onClick={() => setAmendmentVisible(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={savingSalesBookAction || !amendmentInvoiceId || !amendmentReason.trim()} onClick={() => void startSalesBookAmendment()}>{savingSalesBookAction ? "Starting…" : "Continue to invoice"}</button></footer></section></div> : null}
  </div>;
}
