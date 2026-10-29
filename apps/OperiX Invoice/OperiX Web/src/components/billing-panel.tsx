"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { BILLING_CURRENCY, PLAN_DEFINITIONS, calculateSubscriptionPrice, formatBillingAmount, separatePlanMonthlyTotal, type BillingInterval, type PurchasablePlan } from "@invoice-monorepo/billing";
import { useWorkspace } from "@/hooks/use-workspace";
import type { InvoiceBillingSummary } from "@/lib/billing/server";

type SummaryResponse = { summary: InvoiceBillingSummary; companyId: string; rootCompanyId: string };

function date(value: string | null) { return value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"; }
function statusLabel(status: string) { return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function amount(value: string | number) { return formatBillingAmount(String(value), BILLING_CURRENCY); }

export function BillingPanel() {
  const workspace = useWorkspace();
  const [result, setResult] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!workspace.companyId) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/billing/summary?companyId=${encodeURIComponent(workspace.companyId)}`, { cache: "no-store" });
      const body = await response.json() as SummaryResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Billing information could not be loaded.");
      setResult(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Billing information could not be loaded."); }
    finally { setLoading(false); }
  }, [workspace.companyId]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function openPlan(plan: "invoice" | "suite", interval: BillingInterval) {
    if (!result?.summary.billing_management_allowed) return;
    setBusy(`${plan}-${interval}`); setError("");
    try {
      const currentPlan = result.summary.plan === "invoice" || result.summary.plan === "suite" ? result.summary.plan : null;
      const hasPaidSubscription = Boolean(result.summary.stripe_subscription_id) || Boolean(result.summary.billing_interval && ["active", "past_due", "unpaid", "canceled", "incomplete", "paused"].includes(result.summary.status));
      const changing = hasPaidSubscription && currentPlan && (currentPlan !== plan || result.summary.billing_interval !== interval);
      const endpoint = changing ? "/api/billing/change-plan" : "/api/billing/checkout";
      const payload = changing ? { currentPlan, targetPlan: plan, interval, companyId: result.companyId } : { plan, interval, companyId: result.companyId };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { url?: string; scheduled?: boolean; effectiveAt?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "The selected plan could not be opened.");
      if (body.url) { window.location.assign(body.url); return; }
      await load();
      if (body.scheduled && body.effectiveAt) setError(`The plan change is scheduled for ${date(body.effectiveAt)}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The selected plan could not be opened."); }
    finally { setBusy(null); }
  }

  async function manageSubscription() {
    if (!result?.summary.billing_management_allowed) return;
    setBusy("portal"); setError("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: result.companyId }) });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "The billing portal could not be opened.");
      window.location.assign(body.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The billing portal could not be opened."); setBusy(null); }
  }

  const summary = result?.summary;
  const currentPlan = summary?.plan === "invoice" || summary?.plan === "suite" ? summary.plan : null;
  const restricted = Boolean(summary?.restricted);
  const paymentWarning = summary?.status === "past_due" || summary?.status === "unpaid";
  const hasSubscription = Boolean(summary?.stripe_subscription_id) || Boolean(summary?.billing_interval && ["active", "past_due", "unpaid", "canceled", "incomplete", "paused"].includes(summary.status));
  const monthlyPreview = useMemo(() => summary ? calculateSubscriptionPrice({ plan: currentPlan || "invoice", interval: "monthly", totalTenants: summary.total_tenants, totalActiveUsers: summary.total_users }) : null, [summary, currentPlan]);
  const annualPreview = useMemo(() => summary ? calculateSubscriptionPrice({ plan: currentPlan || "invoice", interval: "annual", totalTenants: summary.total_tenants, totalActiveUsers: summary.total_users }) : null, [summary, currentPlan]);
  const suiteMonthly = useMemo(() => summary ? calculateSubscriptionPrice({ plan: "suite", interval: "monthly", totalTenants: summary.total_tenants, totalActiveUsers: summary.total_users }) : null, [summary]);
  const suiteAnnual = useMemo(() => summary ? calculateSubscriptionPrice({ plan: "suite", interval: "annual", totalTenants: summary.total_tenants, totalActiveUsers: summary.total_users }) : null, [summary]);
  const separateMonthly = useMemo(() => summary ? separatePlanMonthlyTotal(summary.total_tenants, summary.total_users) : null, [summary]);
  const activeInterval: BillingInterval = summary?.billing_interval === "annual" ? "annual" : "monthly";
  const activePricing = PLAN_DEFINITIONS[currentPlan || "invoice"].pricing[activeInterval];
  const activePreview = activeInterval === "annual" ? annualPreview : monthlyPreview;

  if (loading) return <div className="grid gap-3"><div className="skeleton h-28 rounded-xl" /><div className="skeleton h-52 rounded-xl" /><div className="skeleton h-40 rounded-xl" /></div>;
  if (error && !summary) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><strong>Billing unavailable</strong><p className="mt-1">{error}</p><button type="button" className="btn mt-4" onClick={() => void load()}><RefreshCw size={15} />Try again</button></div>;
  if (!summary || !monthlyPreview || !annualPreview || !suiteMonthly || !suiteAnnual || !separateMonthly) return null;

  return <div className="grid gap-5">
    <section className="rounded-xl border border-[#dbe5f5] bg-[#f8fbff] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#004ffe] text-white"><CreditCard size={21} /></span><div><p className="muted text-[11px] uppercase tracking-[0.12em]">OperiX Invoice</p><h2 className="mt-1 text-xl font-semibold">Billing &amp; Subscription</h2><p className="muted mt-1 text-xs">Choose Invoice standalone or the recommended Suite bundle.</p></div></div><span className={`status ${restricted ? "status-overdue" : paymentWarning ? "status-draft" : "status-paid"}`}>{statusLabel(summary.status)}</span></div>{summary.status === "trialing" && !restricted ? <div className="mt-5 rounded-lg border border-[#b9d2ff] bg-white p-4 text-sm"><strong>No paid plan yet</strong><p className="muted mt-1 text-xs">Your data on this device stays free. Choose a plan below for cloud backup, teams, portal links and the API.</p></div> : null}{paymentWarning ? <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><strong>Payment failed</strong><p className="mt-1 text-xs">We couldn&apos;t process your subscription payment. Update your payment method to avoid interruption.</p></div></div> : null}{restricted ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><strong>Your workspace is in restricted mode.</strong><p className="mt-1 text-xs">You can still view records, export available data, and manage billing. Core paid-product writes remain disabled until access is restored.</p></div> : null}{summary.cancel_at_period_end && summary.current_period_end ? <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Subscription canceled</strong><p className="mt-1 text-xs">You can continue using OperiX Invoice until {date(summary.current_period_end)}.</p></div> : null}</section>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><ProductCard plan="invoice" interval="monthly" preview={monthlyPreview} currentPlan={currentPlan} currentInterval={summary.billing_interval} busy={busy === "invoice-monthly"} canManage={summary.billing_management_allowed} hasSubscription={hasSubscription} onSelect={() => void openPlan("invoice", "monthly")} /><ProductCard plan="invoice" interval="annual" preview={annualPreview} currentPlan={currentPlan} currentInterval={summary.billing_interval} busy={busy === "invoice-annual"} canManage={summary.billing_management_allowed} hasSubscription={hasSubscription} onSelect={() => void openPlan("invoice", "annual")} /><ProductCard plan="suite" interval="monthly" preview={suiteMonthly} currentPlan={currentPlan} currentInterval={summary.billing_interval} busy={busy === "suite-monthly"} canManage={summary.billing_management_allowed} hasSubscription={hasSubscription} onSelect={() => void openPlan("suite", "monthly")} recommended /><ProductCard plan="suite" interval="annual" preview={suiteAnnual} currentPlan={currentPlan} currentInterval={summary.billing_interval} busy={busy === "suite-annual"} canManage={summary.billing_management_allowed} hasSubscription={hasSubscription} onSelect={() => void openPlan("suite", "annual")} recommended /></section>
    <section className="rounded-xl border border-[#dbe5f5] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Usage and estimated billing</h3><p className="muted mt-1 text-xs">The backend counts billable tenant memberships and active or suspended company users. Suite meters them once for both products.</p></div><div className="flex flex-wrap gap-2">{summary.billing_management_allowed ? <Link href="/settings?tab=company" className="btn">Manage companies</Link> : null}{summary.billing_management_allowed ? <Link href="/settings?tab=users-access" className="btn">Manage users</Link> : null}{summary.billing_management_allowed && hasSubscription ? <button type="button" className="btn" disabled={busy === "portal"} onClick={() => void manageSubscription()}>{busy === "portal" ? "Opening…" : "Manage Subscription"}<ExternalLink size={15} /></button> : null}</div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><UsageCard label="Tenants" total={summary.total_tenants} included={summary.included_tenants} additional={summary.billable_tenants} /><UsageCard label="Users" total={summary.total_users} included={summary.included_users} additional={summary.billable_users} /></div><dl className="mt-5 grid gap-3 rounded-lg border border-[#e6ebf3] bg-[#f8fbff] p-4 text-xs sm:grid-cols-2"><BillingLine label={currentPlan === "suite" ? "OperiX Suite" : "OperiX Invoice"} value={amount(activePricing.base)} detail={`Base / ${activeInterval === "annual" ? "year" : "month"}`} /><BillingLine label="Additional companies" value={amount(Number(activePricing.additionalTenant) * summary.billable_tenants)} detail={`${summary.billable_tenants} × ${amount(activePricing.additionalTenant)}`} /><BillingLine label="Additional users" value={amount(Number(activePricing.additionalUser) * summary.billable_users)} detail={`${summary.billable_users} × ${amount(activePricing.additionalUser)}`} /><BillingLine label="Estimated total" value={amount((activePreview?.total ?? (activeInterval === "annual" ? summary.estimated_annual_total : summary.estimated_monthly_total)) ?? 0)} detail={`per ${activeInterval === "annual" ? "year" : "month"}`} strong /></dl><div className="mt-5 grid gap-3 sm:grid-cols-2"><TotalCard label="Invoice + Booking separately" value={`${amount(separateMonthly)}/month`} detail="Separate product subscriptions with product-specific add-ons" /><TotalCard label="Suite recommended" value={`${amount(suiteAnnual.total)}/year`} detail="€49.99 annual base + shared add-ons" recommended /></div><dl className="mt-5 grid gap-3 border-t border-[#e6ebf3] pt-4 text-xs sm:grid-cols-2"><div><dt className="muted">Renewal / current period end</dt><dd className="mt-1 font-medium">{date(summary.current_period_end)}</dd></div>{summary.scheduled_plan ? <div><dt className="muted">Scheduled plan</dt><dd className="mt-1 font-medium">{summary.scheduled_plan} on {date(summary.scheduled_change_at)}</dd></div> : null}</dl><p className="muted mt-4 text-[11px]">Estimates use exact EUR amounts. Stripe may adjust the immediate invoice for prorations when a plan, interval, or quantity changes.</p>{error ? <p className="mt-3 text-xs text-red-700" role="alert">{error}</p> : null}</section>
  </div>;
}

function ProductCard({ plan, interval, preview, currentPlan, currentInterval, busy, canManage, hasSubscription, onSelect, recommended }: { plan: PurchasablePlan; interval: BillingInterval; preview: ReturnType<typeof calculateSubscriptionPrice>; currentPlan: "invoice" | "suite" | null; currentInterval: BillingInterval | null; busy: boolean; canManage: boolean; hasSubscription: boolean; onSelect: () => void; recommended?: boolean }) {
  const definition = PLAN_DEFINITIONS[plan];
  const selected = currentPlan === plan && currentInterval === interval;
  const canStart = canManage && !selected;
  const annual = interval === "annual";
  return <article className={`rounded-xl border p-5 ${recommended ? "border-[#004ffe] bg-[#f8fbff]" : "border-[#dbe5f5]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{definition.name}</p><p className="muted mt-1 text-[11px]">{plan === "suite" ? "Invoice + Booking" : "Standalone subscription"}</p><p className="mt-2 text-2xl font-semibold">{formatBillingAmount(definition.pricing[interval].base, BILLING_CURRENCY)}<span className="muted text-xs font-normal">/{annual ? "year" : "month"}</span></p></div>{recommended ? <span className="rounded-full bg-[#e6efff] px-2.5 py-1 text-[11px] font-medium text-[#004ffe]">RECOMMENDED</span> : null}</div><ul className="mt-4 grid gap-2 text-xs"><li className="flex gap-2"><Check size={15} className="text-[#12b76a]" />{plan === "suite" ? "1 shared tenant" : "1 tenant"} included</li><li className="flex gap-2"><Check size={15} className="text-[#12b76a]" />{plan === "suite" ? "1 shared active user" : "1 active user"} included</li><li className="flex gap-2"><Check size={15} className="text-[#12b76a]" />Additional tenant {formatBillingAmount(definition.pricing[interval].additionalTenant, BILLING_CURRENCY)}</li><li className="flex gap-2"><Check size={15} className="text-[#12b76a]" />Additional active user {formatBillingAmount(definition.pricing[interval].additionalUser, BILLING_CURRENCY)}</li></ul><p className="muted mt-4 text-xs">Estimated for current usage: <strong className="text-[var(--foreground)]">{formatBillingAmount(preview.total, BILLING_CURRENCY)}</strong></p>{canStart ? <button type="button" className="btn btn-primary mt-5 w-full" disabled={busy} onClick={onSelect}>{busy ? "Opening secure checkout…" : hasSubscription ? "Change plan" : "Subscribe"}</button> : selected ? <span className="mt-5 flex items-center justify-center gap-2 rounded-md border border-[#dbe5f5] px-3 py-2 text-xs font-medium"><Check size={15} />Current plan</span> : !canManage ? <span className="muted mt-5 block text-center text-xs">Billing management is limited to workspace administrators.</span> : null}</article>;
}

function UsageCard({ label, total, included, additional }: { label: string; total: number; included: number; additional: number }) { return <div className="rounded-lg bg-[#f7f9fc] p-4"><p className="muted text-xs">{label}</p><p className="mt-1 text-lg font-semibold">{total} total</p><p className="muted mt-1 text-[11px]">{included} included · {additional} additional</p></div>; }
function BillingLine({ label, value, detail, strong }: { label: string; value: string; detail: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-4"><div><dt className={strong ? "font-semibold" : "muted"}>{label}</dt><dd className="mt-1 text-[11px] text-[#61708a]">{detail}</dd></div><dd className={strong ? "text-base font-semibold" : "font-medium"}>{value}</dd></div>; }
function TotalCard({ label, value, detail, recommended }: { label: string; value: string; detail: string; recommended?: boolean }) { return <div className={`rounded-lg border p-4 ${recommended ? "border-[#b9d2ff] bg-[#f8fbff]" : "border-[#e6ebf3]"}`}><p className="muted text-xs">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p><p className="muted mt-1 text-[11px]">{detail}</p></div>; }
