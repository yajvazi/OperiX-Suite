"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleCheck,
  CircleDollarSign,
  FileCheck2,
  FileText,
  HandCoins,
  PackagePlus,
  Plus,
  ReceiptText,
  ShoppingCart,
  UserPlus,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBusinessData } from "@/hooks/use-business-data";
import { useWorkspace } from "@/hooks/use-workspace";
import { money, shortDate } from "@/lib/format";
import type { ExpenseRow, InvoiceRow, ProductRow } from "@/lib/models";
import { EmptyState, ErrorState, LoadingSkeleton, MetricCard, PageHeader, QuickAction, SectionCard, StatusBadge } from "./ui";

type Period = "all" | "today" | "7d" | "30d";
type Activity = { id: string; title: string; subtitle: string; amount?: string; href: string; icon: LucideIcon; status?: string };

const periodOptions: Array<{ value: Period; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export function DashboardView() {
  const [period, setPeriod] = useState<Period>("all");
  const workspace = useWorkspace();
  const workspaceName = workspace.company?.company_name || workspace.company?.name || workspace.profile?.company_name || "there";
  const invoicesQuery = useBusinessData<InvoiceRow>("invoices", "*, client:clients(name)");
  const expensesQuery = useBusinessData<ExpenseRow>("expenses");
  const productsQuery = useBusinessData<ProductRow>("products", "id,name,stock_quantity,unit_price,created_at");
  const invoices = useMemo(() => invoicesQuery.data.filter((row) => row.type !== "offer" && row.status !== "cancelled" && inPeriod(row.issue_date, period)), [invoicesQuery.data, period]);
  const expenses = useMemo(() => expensesQuery.data.filter((row) => inPeriod(row.date, period)), [expensesQuery.data, period]);
  const products = productsQuery.data;
  const totalRevenue = invoices.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const salesCount = invoices.length;
  const outstanding = invoices.filter((row) => !["paid", "cancelled"].includes(row.status)).reduce((sum, row) => sum + Math.max(0, Number(row.total_amount || 0) - Number(row.amount_received || 0)), 0);
  const overdueInvoices = invoices.filter((row) => row.status === "overdue" || (row.due_date && new Date(`${row.due_date}T23:59:59`) < new Date() && row.status !== "paid"));
  const overdue = overdueInvoices.reduce((sum, row) => sum + Math.max(0, Number(row.total_amount || 0) - Number(row.amount_received || 0)), 0);
  const paymentsReceived = invoices.reduce((sum, row) => sum + (Number(row.amount_received || 0) || (row.status === "paid" ? Number(row.total_amount || 0) : 0)), 0);
  const revenueToday = invoicesQuery.data.filter((row) => row.type !== "offer" && row.status !== "cancelled" && isToday(row.issue_date)).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const expenseTotal = expenses.filter((row) => row.type !== "income").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const lowStock = products.filter((product) => product.stock_quantity !== undefined && product.stock_quantity !== null && Number(product.stock_quantity) <= 5);
  const monthly = useMemo(() => monthPoints(invoices, expenses), [expenses, invoices]);
  const activities = useMemo(() => buildActivities(invoicesQuery.data, expensesQuery.data), [expensesQuery.data, invoicesQuery.data]);
  const loading = invoicesQuery.loading || expensesQuery.loading || productsQuery.loading;
  const error = invoicesQuery.error || expensesQuery.error || productsQuery.error;

  return (
    <div className="ux-page dashboard-page">
      <section className="standard-dashboard-hero">
        <div className="standard-dashboard-hero-copy"><p className="standard-dashboard-kicker">Business overview</p><h1>Welcome, {workspaceName}</h1><p>Here’s what’s happening with your business today.</p></div>
        <label className="standard-dashboard-hero-action standard-dashboard-period-select"><span className="sr-only">Dashboard period</span><select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>{periodOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      </section>
      {error ? <ErrorState message={error} onRetry={() => { void invoicesQuery.refresh(); void expensesQuery.refresh(); void productsQuery.refresh(); }} /> : null}
      {loading && !invoicesQuery.data.length && !expensesQuery.data.length ? <LoadingSkeleton rows={5} /> : null}
      {!loading && !error && !invoicesQuery.data.length && !expensesQuery.data.length ? <EmptyState title="Your workspace is ready" description="Create your first invoice or add a customer to start seeing business activity here." actionLabel="Create invoice" actionHref="/invoices/new" icon={ReceiptText} /> : null}
      {!error && (loading || invoicesQuery.data.length || expensesQuery.data.length) ? <>
        <section className="dashboard-highlight" aria-label="Revenue today">
          <div><span>Revenue Today</span><strong>{money(revenueToday)}</strong><small>{period === "all" ? "Live workspace total for today" : `Filtered to ${periodOptions.find((option) => option.value === period)?.label.toLowerCase()}`}</small></div>
          <div className="dashboard-highlight-chart" aria-hidden="true">{[34, 48, 29, 62, 45, 76, 59, 88].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div>
        </section>
        <section className="ux-metric-grid" aria-label="Business overview">
          <MetricCard label="Revenue" value={money(totalRevenue)} icon={CircleDollarSign} tone="blue" />
          <MetricCard label="Sales" value={String(salesCount)} note="Invoices issued" icon={ReceiptText} tone="green" />
          <MetricCard label="Outstanding" value={money(outstanding)} note={`${invoices.filter((invoice) => !["paid", "cancelled"].includes(invoice.status)).length} open invoices`} icon={WalletCards} tone="amber" />
          <MetricCard label="Overdue" value={money(overdue)} note={`${overdueInvoices.length} invoices`} icon={AlertCircle} tone="red" />
          <MetricCard label="Payments Received" value={money(paymentsReceived)} note={expenseTotal ? `Expenses ${money(expenseTotal)}` : "Recorded on invoices"} icon={Banknote} tone="green" />
        </section>
        <section className="dashboard-main-grid">
          <SectionCard title="Quick Actions" action={<Link className="ux-inline-link" href="/more">View all</Link>} className="dashboard-quick-card">
            <div className="ux-quick-actions">
              <QuickAction label="New Invoice" icon={FileText} href="/invoices/new" />
              <QuickAction label="New Quote" icon={FileCheck2} href="/invoices/new?type=offer" />
              <QuickAction label="POS Sale" icon={ShoppingCart} href="/pos" />
              <QuickAction label="New Customer" icon={UserPlus} href="/customers?create=1" />
              <QuickAction label="New Product" icon={PackagePlus} href="/products?create=1" />
              <QuickAction label="Add Expense" icon={Plus} href="/expenses?create=1" />
            </div>
          </SectionCard>
          <SectionCard title="Revenue Overview" description="Issued invoices and other income by month." action={<Link className="ux-inline-link" href="/reports">View reports</Link>} className="dashboard-revenue-card">
            <div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="#edf0f4" vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#98a2b3" }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#98a2b3" }} tickFormatter={(value) => `€${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => money(Number(value))} /><Area isAnimationActive={false} type="monotone" dataKey="revenue" stroke="#004FFE" strokeWidth={2.5} fill="#edf4ff" /></AreaChart></ResponsiveContainer></div>
          </SectionCard>
          <SectionCard title="Needs Attention" action={<Link className="ux-inline-link" href="/invoices">View invoices</Link>} className="dashboard-attention-card">
            <div className="dashboard-list">{overdueInvoices.length ? <AttentionRow icon={AlertCircle} tone="danger" title={`${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"}`} value={money(overdue)} href="/invoices?status=overdue" /> : null}{invoices.filter((invoice) => !["paid", "cancelled"].includes(invoice.status) && !overdueInvoices.some((overdueInvoice) => overdueInvoice.id === invoice.id)).length ? <AttentionRow icon={WalletCards} tone="warning" title="Open invoice balance" value={money(outstanding)} href="/invoices" /> : null}{lowStock.length ? <AttentionRow icon={Boxes} tone="warning" title="Low stock items" value={`${lowStock.length} products`} href="/inventory" /> : null}{!overdueInvoices.length && !lowStock.length && !invoices.some((invoice) => !["paid", "cancelled"].includes(invoice.status)) ? <div className="dashboard-list-empty"><CircleCheck size={18} />All caught up.</div> : null}</div>
          </SectionCard>
          <SectionCard title="Recent Activity" action={<Link className="ux-inline-link" href="/invoices">View all</Link>} className="dashboard-activity-card">
            <div className="dashboard-list">{activities.slice(0, 6).map((activity) => <ActivityRow key={activity.id} activity={activity} />)}{!activities.length ? <div className="dashboard-list-empty">No activity yet.</div> : null}</div>
          </SectionCard>
        </section>
      </> : null}
    </div>
  );
}

function AttentionRow({ icon: Icon, tone, title, value, href }: { icon: LucideIcon; tone: "danger" | "warning"; title: string; value: string; href: string }) {
  return <Link href={href} className="dashboard-attention-row"><span className={`dashboard-row-icon ${tone}`}><Icon size={15} /></span><span>{title}</span><strong>{value}</strong><ArrowUpRight size={14} /></Link>;
}

function ActivityRow({ activity }: { activity: Activity }) {
  const Icon = activity.icon;
  return <Link href={activity.href} className="dashboard-activity-row"><span className="dashboard-row-icon"><Icon size={15} /></span><span className="dashboard-activity-copy"><strong>{activity.title}</strong><small>{activity.subtitle}</small></span><span className="dashboard-activity-end">{activity.amount ? <strong>{activity.amount}</strong> : null}{activity.status ? <StatusBadge status={activity.status} /> : null}</span></Link>;
}

function buildActivities(invoices: InvoiceRow[], expenses: ExpenseRow[]): Activity[] {
  const invoiceActivities = invoices.map((invoice) => ({ id: `invoice-${invoice.id}`, title: `Invoice ${invoice.invoice_number}`, subtitle: `${invoice.client?.name || "Customer"} · ${shortDate(invoice.issue_date)}`, amount: money(invoice.total_amount), href: `/invoices/${invoice.id}`, icon: FileText, status: invoice.status }));
  const expenseActivities = expenses.map((expense) => ({ id: `expense-${expense.id}`, title: expense.type === "income" ? "Income recorded" : "Expense added", subtitle: `${expense.description || expense.category} · ${shortDate(expense.date)}`, amount: money(expense.amount), href: expense.type === "income" ? "/income" : "/expenses", icon: expense.type === "income" ? HandCoins : WalletCards }));
  return [...invoiceActivities, ...expenseActivities].sort((a, b) => a.subtitle.localeCompare(b.subtitle)).reverse();
}

function monthPoints(invoices: InvoiceRow[], expenses: ExpenseRow[]) {
  const formatter = new Intl.DateTimeFormat("en", { month: "short" });
  const now = new Date();
  const points = Array.from({ length: 12 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1); return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, month: formatter.format(date), revenue: 0 }; });
  const byMonth = new Map(points.map((point) => [point.key, point]));
  invoices.forEach((row) => { const point = byMonth.get(String(row.issue_date).slice(0, 7)); if (point) point.revenue += Number(row.total_amount || 0); });
  expenses.filter((row) => row.type === "income").forEach((row) => { const point = byMonth.get(String(row.date).slice(0, 7)); if (point) point.revenue += Number(row.amount || 0); });
  return points;
}

function inPeriod(value: string, period: Period) {
  if (period === "all") return true;
  const date = new Date(`${value}T12:00:00`);
  const now = new Date();
  date.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  if (period === "today") return date.getTime() === now.getTime();
  const days = period === "7d" ? 7 : 30;
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return date >= start && date <= now;
}

function isToday(value: string) { return inPeriod(value, "today"); }
