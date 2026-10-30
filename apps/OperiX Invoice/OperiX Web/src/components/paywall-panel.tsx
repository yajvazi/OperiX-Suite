"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Lock } from "lucide-react";
import { PLAN_DEFINITIONS, type BillingInterval } from "@invoice-monorepo/billing";

export const cloudBenefits = [
  "Works on the web and in the mobile app, always in sync",
  "Cloud backup: your data is safe even if you lose a device",
  "Team members with roles and permissions",
  "Customer portal links and online payments",
  "Public API and integrations",
  "Updates and support included",
];

/**
 * The OperiX Cloud paywall: price, what you get, and a secure Stripe checkout. Stripe's page offers card, Apple Pay
 * and Google Pay (whichever your device supports). Used in onboarding and when a workspace has no active subscription.
 */
export function PaywallPanel({ title, lead, canPay = true, notPayerMessage, freeLabel, onFree, onSignOut }: {
  title: string;
  lead: string;
  /** False for members who are not administrators: they see a message instead of the subscribe button. */
  canPay?: boolean;
  notPayerMessage?: string;
  freeLabel?: string;
  onFree?: () => void;
  onSignOut?: () => void;
}) {
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pricing = PLAN_DEFINITIONS.invoice.pricing;
  const savings = useMemo(() => Math.round((1 - Number(pricing.annual.base) / (Number(pricing.monthly.base) * 12)) * 100), [pricing]);

  async function subscribe() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "invoice", interval }) });
      const body = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Checkout is unavailable right now.");
      window.location.assign(body.url);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Checkout is unavailable right now.");
      setBusy(false);
    }
  }

  return <section className="ob-panel" aria-labelledby="paywall-title">
    <span className="eyebrow"><Lock size={13} style={{ display: "inline", marginRight: 6 }} />OperiX Cloud</span>
    <h1 id="paywall-title">{title}</h1>
    <p className="ob-lead">{lead}</p>
    <div className="ob-toggle" role="group" aria-label="Billing period">
      <button type="button" className={interval === "annual" ? "on" : ""} onClick={() => setInterval("annual")}>Yearly <span className="ob-badge ob-badge-green">Save {savings}%</span></button>
      <button type="button" className={interval === "monthly" ? "on" : ""} onClick={() => setInterval("monthly")}>Monthly</button>
    </div>
    <div className="ob-price"><strong>€{pricing[interval].base}</strong><span>/{interval === "annual" ? "year" : "month"}</span><small>OperiX Invoice · €{pricing[interval].additionalUser} per extra user</small></div>
    <ul className="ob-checks">{cloudBenefits.map((benefit) => <li key={benefit}><Check size={15} />{benefit}</li>)}</ul>
    {message ? <p role="alert" className="form-error">{message}</p> : null}
    {canPay ? <>
      <div className="ob-actions">
        {onFree ? <button type="button" className="btn" onClick={onFree} disabled={busy}>{freeLabel || "Use free in this browser"}</button> : <span />}
        <button type="button" className="btn btn-primary" onClick={() => void subscribe()} disabled={busy}>{busy ? "Please wait…" : "Subscribe"}<ArrowRight size={16} /></button>
      </div>
      <p className="ob-note">Pay securely with Stripe: card, Apple Pay or Google Pay. Cancel any time from Settings → Billing.</p>
    </> : <>
      <p className="ob-note ob-note-warn">{notPayerMessage || "Only a workspace administrator can subscribe. Ask your administrator to subscribe to OperiX Cloud."}</p>
      <div className="ob-actions">{onFree ? <button type="button" className="btn" onClick={onFree}>{freeLabel || "Use free in this browser"}</button> : <span />}</div>
    </>}
    <p className="ob-note" style={{ marginTop: 12 }}>OperiX is always free to use. Without a subscription you can keep your data in this browser at no cost.</p>
    {onSignOut ? <div className="ob-actions" style={{ marginTop: 8 }}><span /><button type="button" className="ob-link" onClick={onSignOut}>Sign out</button></div> : null}
  </section>;
}
