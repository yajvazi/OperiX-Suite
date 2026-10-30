"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp, BarChart3, Boxes, CalendarDays, CheckCircle2, FileCheck2, FileText, HandCoins, Landmark,
  ReceiptText, Scale, Search, TrendingUp, Users, WalletCards, Archive,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { localReportRows } from "@invoice-monorepo/data-store";
import { isLocalReportType } from "@invoice-monorepo/data-store";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { getLocalStore } from "@/lib/local/local-store";
import { getUiLanguage } from "@/lib/i18n/language";
import { money } from "@/lib/format";
import { REPORT_DEFINITIONS } from "@/lib/report-definitions";
import { rt } from "@/lib/report-i18n";
import { ErrorState, MetricCard, PageHeader, SectionCard } from "./ui";
import { LocalLedgerReports } from "./local-ledger-reports";
import { LocalTaxRegisters } from "./local-tax-registers";

type Summary = { revenue: number; expenses: number; net_profit: number; ar_outstanding: number; ap_outstanding: number };
type ReportRow = Record<string, unknown>;
type Card = { key: string; icon: LucideIcon; href?: string; permission: string; title?: { en: string; sq: string }; subtitle?: { en: string; sq: string } };

const STATEMENTS: Card[] = [
  { key: "trial_balance", icon: Scale, permission: "reports.operational" },
  { key: "profit_loss", icon: TrendingUp, permission: "reports.profit" },
  { key: "balance_sheet", icon: BarChart3, permission: "reports.operational" },
  { key: "cash_flow", icon: HandCoins, permission: "reports.operational" },
  { key: "changes_equity", icon: ArrowDownUp, permission: "reports.operational" },
  { key: "general_ledger", icon: FileText, permission: "reports.operational" },
  { key: "asset_register", icon: Landmark, permission: "reports.operational" },
  { key: "inventory_register", icon: Boxes, permission: "inventory.view" },
  { key: "ar_aging", icon: Users, permission: "reports.operational" },
  { key: "ap_aging", icon: Users, permission: "reports.operational" },
];

const TAXES: Card[] = [
  { key: "sales_book", icon: ReceiptText, permission: "sales_book.view" },
  { key: "purchase_book", icon: FileCheck2, permission: "reports.tax" },
  { key: "cash_book", icon: WalletCards, permission: "reports.operational" },
  { key: "payroll", icon: Landmark, href: "/payroll", permission: "users.view", title: { en: "Payroll", sq: "Pagat" }, subtitle: { en: "Payroll and statutory controls.", sq: "Pagat dhe kontrollet ligjore." } },
  { key: "withholding", icon: FileCheck2, permission: "reports.tax" },
  { key: "declarations", icon: FileText, permission: "reports.tax" },
  { key: "archive", icon: Archive, permission: "audit.view" },
  { key: "tax_calendar", icon: CalendarDays, permission: "reports.tax" },
];

const empty: Summary = { revenue: 0, expenses: 0, net_profit: 0, ar_outstanding: 0, ap_outstanding: 0 };
const num = (row: ReportRow, key: string) => Number(row[key] || 0);

export function ReportsView() {
  const workspace = useWorkspace();
  const lang = getUiLanguage();
  const local = workspace.storage === "local";
  const [summary, setSummary] = useState<Summary>(empty);
  const [reconciles, setReconciles] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (workspace.loading) return;
    setError("");
    if (!workspace.companyIds.length) { setSummary(empty); setLoading(false); return; }
    try {
      let rows: ReportRow[];
      let reconciliation: ReportRow | undefined;
      if (local) {
        rows = await localReportRows(await getLocalStore(), "operix_report_summary") as ReportRow[];
      } else {
        const supabase = createClient();
        if (!supabase) throw new Error("Supabase is not configured.");
        const [summaryResult, reconciliationResult] = await Promise.all([
          supabase.from("operix_report_summary").select("*").in("company_id", workspace.companyIds),
          supabase.from("operix_financial_reconciliation").select("*").in("company_id", workspace.companyIds),
        ]);
        if (summaryResult.error) throw summaryResult.error;
        rows = (summaryResult.data || []) as ReportRow[];
        reconciliation = ((reconciliationResult.data || [])[0] as ReportRow | undefined);
      }
      setSummary(rows.reduce<Summary>((result, row) => ({
        revenue: result.revenue + num(row, "revenue"),
        expenses: result.expenses + num(row, "expenses"),
        net_profit: result.net_profit + num(row, "net_profit"),
        ar_outstanding: result.ar_outstanding + num(row, "ar_outstanding"),
        ap_outstanding: result.ap_outstanding + num(row, "ap_outstanding"),
      }), empty));
      setReconciles(reconciliation ? Boolean(reconciliation.reconciles) : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [local, workspace.companyIds, workspace.loading]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const keep = (card: Card) => {
      if (!workspace.can(card.key === "sales_book" ? "sales_book.view" : card.permission)) return false;
      if (local && !card.href && !isLocalReportType(card.key)) return false;
      if (!needle) return true;
      const title = card.title || REPORT_DEFINITIONS[card.key]?.title;
      const subtitle = card.subtitle || REPORT_DEFINITIONS[card.key]?.subtitle;
      return `${title?.[lang] || ""} ${subtitle?.[lang] || ""}`.toLowerCase().includes(needle);
    };
    return { statements: STATEMENTS.filter(keep), taxes: TAXES.filter(keep) };
  }, [lang, local, needle, workspace]);

  const header = <PageHeader title={rt(lang, "Reports & taxes")} description={rt(lang, local ? "Summary and statements from the records stored in this browser." : "Financial statements, books and tax records from your posted accounting entries.")} />;
  const canViewAny = [...STATEMENTS, ...TAXES].some((card) => workspace.can(card.permission)) || workspace.can("reports.sales");
  if (loading || workspace.loading) return <div className="ux-page reports-page">{header}<div className="ux-state"><p>{rt(lang, "Loading…")}</p></div></div>;
  if (!canViewAny) return <div className="ux-page reports-page">{header}<ErrorState message={rt(lang, "You do not have permission to view this report.")} /></div>;
  if (error) return <div className="ux-page reports-page">{header}<ErrorState message={error} onRetry={() => void load()} /></div>;

  const grid = (cards: Card[]) => <section className="reports-category-grid">{cards.map((card) => {
    const definition = REPORT_DEFINITIONS[card.key];
    const title = (card.title || definition?.title)?.[lang] || card.key;
    const subtitle = (card.subtitle || definition?.subtitle)?.[lang] || "";
    const Icon = card.icon;
    return <Link key={card.key} href={card.href || `/reports/${card.key}`} className="reports-category-card"><span className="reports-category-icon"><Icon size={19} /></span><span><strong>{title}</strong><small>{subtitle}</small></span></Link>;
  })}</section>;

  return <div className="ux-page reports-page">
    {header}
    <section className="ux-metric-grid reports-metrics">
      <MetricCard label={rt(lang, "Revenue")} value={money(summary.revenue)} icon={BarChart3} tone="blue" />
      <MetricCard label={rt(lang, "Expenses")} value={money(summary.expenses)} icon={WalletCards} tone="red" />
      {workspace.can("reports.profit") ? <MetricCard label={rt(lang, "Net profit")} value={money(summary.net_profit)} icon={HandCoins} tone={summary.net_profit >= 0 ? "green" : "red"} /> : null}
      <MetricCard label={rt(lang, "Receivables")} value={money(summary.ar_outstanding)} icon={ReceiptText} tone="amber" />
      <MetricCard label={rt(lang, "Payables")} value={money(summary.ap_outstanding)} icon={FileText} tone="slate" />
    </section>
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#dbe5f5] px-3 py-2"><Search size={16} /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={rt(lang, "Search reports…")} aria-label={rt(lang, "Search reports…")} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    {!visible.statements.length && !visible.taxes.length ? <p className="muted rounded-lg border border-dashed p-8 text-center text-sm">{rt(lang, "No report matches your search.")}</p> : null}
    {visible.statements.length ? <section id="statements"><h2 className="ux-section-heading">{rt(lang, "Financial statements")}</h2>{grid(visible.statements)}</section> : null}
    {visible.taxes.length ? <section id="tax-books"><h2 className="ux-section-heading">{rt(lang, "Taxes & compliance")}</h2><p className="ux-section-description">{rt(lang, "Tax books and declaration previews stay linked to posted source data. Electronic submission is not part of this page.")}</p>{grid(visible.taxes)}</section> : null}
    {!local && reconciles !== null ? <SectionCard title={rt(lang, "Control status")} description={rt(lang, "A report is only trustworthy when its accounting controls reconcile.")} className="reports-chart-card"><div className="reports-control-row"><CheckCircle2 size={18} /><strong>{rt(lang, reconciles ? "All reconciliation checks pass" : "Reconciliation requires attention")}</strong></div></SectionCard> : null}
    {local ? <><LocalLedgerReports /><LocalTaxRegisters /></> : null}
  </div>;
}
