"use client";

import { AlertTriangle, CreditCard, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/use-workspace";

type BillingBannerSummary = { status: string; restricted: boolean; cancel_at_period_end: boolean; current_period_end: string | null; billing_management_allowed: boolean };

export function BillingStatusBanner() {
  const workspace = useWorkspace();
  const [summary, setSummary] = useState<BillingBannerSummary | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!workspace.companyId || workspace.storage === "local") return;
    let cancelled = false;
    fetch(`/api/billing/summary?companyId=${encodeURIComponent(workspace.companyId)}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { summary?: BillingBannerSummary };
      if (!cancelled) setSummary(body.summary || null);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [workspace.companyId, workspace.storage]);
  if (dismissed || !summary || (!summary.restricted && !["past_due", "unpaid"].includes(summary.status))) return null;
  const payment = ["past_due", "unpaid"].includes(summary.status);
  return <div className={`mx-4 mt-3 flex items-start gap-3 rounded-lg border px-4 py-3 text-xs lg:mx-6 ${payment ? "border-amber-300 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-900"}`} role="status"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><div className="min-w-0 flex-1"><strong>{payment ? "Payment failed" : "Workspace restricted"}</strong><p className="mt-0.5">{payment ? "Update your payment method to avoid interruption." : "Core paid-product writes are disabled until an active subscription is restored."}</p>{summary.billing_management_allowed ? <Link className="mt-2 inline-flex items-center gap-1 font-medium underline" href="/settings?tab=billing"><CreditCard size={13} />Manage billing</Link> : null}</div><button type="button" className="shrink-0 opacity-70 hover:opacity-100" onClick={() => setDismissed(true)} aria-label="Dismiss billing notice"><X size={15} /></button></div>;
}
