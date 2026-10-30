"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Cloud, ExternalLink, HardDrive, Server, Sparkles } from "lucide-react";
import { PLAN_DEFINITIONS, type BillingInterval } from "@invoice-monorepo/billing";
import { createClient } from "@/lib/supabase/client";
import { clearWorkspaceSnapshot } from "@/hooks/use-workspace";
import { browserStorageSupported, setStorageMode } from "@/lib/local/storage-mode";
import { InvoiceLogo } from "./product-logo";

type Choice = "cloud" | "selfhost" | "free";
type Step = "about" | "choose" | "cloud" | "selfhost" | "free" | "plan";

const REPO_URL = "https://github.com/yajvazi/operix-invoice-web";
const STEPS: Array<{ id: Step[]; label: string }> = [
  { id: ["about"], label: "About you" },
  { id: ["choose"], label: "How to use OperiX" },
  { id: ["cloud", "selfhost", "free"], label: "Set up" },
  { id: ["plan"], label: "Plan" },
];

const cloudBenefits = [
  "Works on the web and in the mobile app, always in sync",
  "Cloud backup: your data is safe even if you lose a device",
  "Team members with roles and permissions",
  "Customer portal links and online payments",
  "Public API and integrations",
  "Updates and support included",
];
const selfHostPoints = [
  "Free and open source (AGPL-3.0)",
  "Runs on your own server, so your data stays with you",
  "The mobile app connects to it by QR code",
  "Needs a server and some technical know-how",
];
const freePoints = [
  "All invoicing and accounting tools",
  "Your data stays in this browser, with no card and no cloud account needed",
  "Download a backup file whenever you like",
  "Change your mind later in Settings → Data storage",
];

const money = (value: string) => `€${value}`;

/** Step-by-step setup for accounts that have no company yet, for example after the first Google or Apple sign-in. */
export function CompanyOnboarding() {
  const [step, setStep] = useState<Step>("about");
  const [choice, setChoice] = useState<Choice>("cloud");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [taxId, setTaxId] = useState("");
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const pricing = PLAN_DEFINITIONS.invoice.pricing;
  const savings = useMemo(() => Math.round((1 - Number(pricing.annual.base) / (Number(pricing.monthly.base) * 12)) * 100), [pricing]);

  useEffect(() => {
    const supabase = createClient();
    void supabase?.auth.getUser().then(({ data }) => {
      const meta = (data.user?.user_metadata || {}) as Record<string, unknown>;
      const full = String(meta.full_name || meta.name || "").trim();
      setFirstName((current) => current || String(meta.given_name || full.split(" ")[0] || ""));
      setLastName((current) => current || String(meta.family_name || full.split(" ").slice(1).join(" ") || ""));
    });
  }, []);

  const activeIndex = STEPS.findIndex((item) => item.id.includes(step));
  const go = (next: Step) => { setMessage(""); setStep(next); };

  async function createCloudWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) { setMessage("Authentication is temporarily unavailable. Please try again in a moment."); return; }
    if (!company.trim()) { setMessage("Enter your company name."); return; }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("complete_signup_onboarding", {
      p_tenant_name: company.trim(), p_first_name: firstName.trim(), p_last_name: lastName.trim(), p_phone: phone.trim(), p_tax_id: taxId.trim(),
    });
    setBusy(false);
    if (error) { setMessage("The workspace could not be created. Please try again."); return; }
    clearWorkspaceSnapshot();
    go("plan");
  }

  function startFree() {
    if (!browserStorageSupported()) { setMessage("This browser cannot keep data on your device. Use a current browser over HTTPS, or choose OperiX Cloud."); return; }
    setStorageMode("local");
    window.location.assign("/dashboard");
  }

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

  async function signOut() {
    await createClient()?.auth.signOut();
    window.location.assign("/login");
  }

  const optionCard = (id: Choice, icon: React.ReactNode, title: string, badge: string, badgeTone: string, points: string[]) => (
    <button type="button" key={id} className={`ob-card ${choice === id ? "ob-card-active" : ""}`} onClick={() => setChoice(id)} aria-pressed={choice === id}>
      <span className="ob-card-icon">{icon}</span>
      <span className="ob-card-head"><strong>{title}</strong><span className={`ob-badge ${badgeTone}`}>{badge}</span></span>
      <ul>{points.map((point) => <li key={point}><Check size={14} />{point}</li>)}</ul>
      <span className="ob-radio" aria-hidden="true">{choice === id ? <Check size={13} /> : null}</span>
    </button>
  );

  return <main className="ob-page">
    <header className="ob-top">
      <InvoiceLogo className="login-brand" />
      <button type="button" className="ob-link" onClick={() => void signOut()}>Sign out</button>
    </header>

    <div className="ob-shell">
      <ol className="ob-steps" aria-label="Setup progress">
        {STEPS.map((item, index) => <li key={item.label} className={index < activeIndex ? "ob-done" : index === activeIndex ? "ob-current" : ""} aria-current={index === activeIndex ? "step" : undefined}>
          <span className="ob-dot">{index < activeIndex ? <Check size={13} /> : index + 1}</span><span className="ob-step-label">{item.label}</span>
        </li>)}
      </ol>

      <section className="ob-panel">
        {step === "about" ? <>
          <span className="eyebrow"><Sparkles size={13} style={{ display: "inline", marginRight: 6 }} />Welcome</span>
          <h1>Welcome to OperiX</h1>
          <p className="ob-lead">Let&apos;s set things up. It takes about a minute. First, tell us who you are.</p>
          <form className="ob-form" onSubmit={(event) => { event.preventDefault(); go("choose"); }}>
            <div className="ob-row">
              <label>First name<div className="input-icon"><input value={firstName} onChange={(event) => setFirstName(event.target.value)} name="firstName" autoComplete="given-name" autoFocus /></div></label>
              <label>Last name<div className="input-icon"><input value={lastName} onChange={(event) => setLastName(event.target.value)} name="lastName" autoComplete="family-name" /></div></label>
            </div>
            <label>Phone (optional)<div className="input-icon"><input value={phone} onChange={(event) => setPhone(event.target.value)} name="phone" type="tel" autoComplete="tel" /></div></label>
            <div className="ob-actions"><span /><button className="btn btn-primary">Continue<ArrowRight size={16} /></button></div>
          </form>
        </> : null}

        {step === "choose" ? <>
          <h1>How would you like to use OperiX?</h1>
          <p className="ob-lead">Pick what suits you today. You can change it later.</p>
          <div className="ob-cards">
            {optionCard("cloud", <Cloud size={20} />, "OperiX Cloud", "Recommended", "ob-badge-blue", cloudBenefits)}
            {optionCard("selfhost", <Server size={20} />, "Self-host", "Free · open source", "ob-badge-grey", selfHostPoints)}
            {optionCard("free", <HardDrive size={20} />, "Start free", "Free forever", "ob-badge-green", freePoints)}
          </div>
          <p className="ob-note"><strong>OperiX is always free to use.</strong> If you don&apos;t want the cloud service or your own server, start free and keep your data in this browser. You never have to pay to use the app.</p>
          <div className="ob-actions"><button type="button" className="btn" onClick={() => go("about")}><ArrowLeft size={16} />Back</button><button type="button" className="btn btn-primary" onClick={() => go(choice)}>Continue<ArrowRight size={16} /></button></div>
        </> : null}

        {step === "cloud" ? <>
          <span className="eyebrow">OperiX Cloud</span>
          <h1>Set up your company</h1>
          <p className="ob-lead">This creates your cloud workspace. You&apos;ll be the administrator and can invite your team later.</p>
          <form className="ob-form" onSubmit={createCloudWorkspace}>
            <label>Company name *<div className="input-icon"><input value={company} onChange={(event) => setCompany(event.target.value)} name="company" required autoFocus /></div></label>
            <label>Business registration number (optional)<div className="input-icon"><input value={taxId} onChange={(event) => setTaxId(event.target.value)} name="taxId" /></div></label>
            {message ? <p role="alert" className="form-error">{message}</p> : null}
            <div className="ob-actions"><button type="button" className="btn" onClick={() => go("choose")}><ArrowLeft size={16} />Back</button><button className="btn btn-primary" disabled={busy}>{busy ? "Please wait…" : "Create workspace"}<ArrowRight size={16} /></button></div>
          </form>
        </> : null}

        {step === "selfhost" ? <>
          <span className="eyebrow">Self-host</span>
          <h1>Run OperiX on your own server</h1>
          <p className="ob-lead">OperiX Invoice is open source. You host the web app and your own database, and the mobile app connects to your server.</p>
          <ol className="ob-list">
            <li><strong>Get the code and the guide.</strong> The README walks you through the database, settings and Docker.</li>
            <li><strong>Start the server.</strong> You need a server with Docker, a domain with HTTPS, and a Supabase project (hosted or your own).</li>
            <li><strong>Connect the mobile app.</strong> In your web app open Settings → Mobile app and scan the QR code from the OperiX Invoice app.</li>
          </ol>
          <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">Open the self-hosting guide<ExternalLink size={15} /></a>
          <p className="ob-note">While you set it up, you can use OperiX free in this browser. Self-hosting needs some technical skill. If that sounds like too much, OperiX Cloud does it all for you.</p>
          <div className="ob-actions">
            <button type="button" className="btn" onClick={() => go("choose")}><ArrowLeft size={16} />Back</button>
            <button type="button" className="btn btn-primary" onClick={() => go("free")}>Use free in this browser for now<ArrowRight size={16} /></button>
          </div>
        </> : null}

        {step === "free" ? <>
          <span className="eyebrow">Start free</span>
          <h1>Free, and it stays free</h1>
          <p className="ob-lead">Your invoices, customers and products are kept in this browser on this device. No card and no cloud account are needed.</p>
          <ul className="ob-checks">
            <li><Check size={15} />Create invoices, quotes and delivery notes, and track expenses and payments</li>
            <li><Check size={15} />Download PDFs and reports</li>
            <li><Check size={15} />Back up and restore your data with a file</li>
          </ul>
          <p className="ob-note ob-note-warn"><strong>Good to know:</strong> data lives only on this device. If you clear this browser&apos;s data or lose the computer, it&apos;s gone unless you downloaded a backup. There is no sync to your phone and no team access. You can move to OperiX Cloud or your own server whenever you like.</p>
          {message ? <p role="alert" className="form-error">{message}</p> : null}
          <div className="ob-actions"><button type="button" className="btn" onClick={() => go("choose")}><ArrowLeft size={16} />Back</button><button type="button" className="btn btn-primary" onClick={startFree}>Start using OperiX<ArrowRight size={16} /></button></div>
        </> : null}

        {step === "plan" ? <>
          <span className="eyebrow">OperiX Cloud</span>
          <h1>Your workspace is ready</h1>
          <p className="ob-lead">Would you like to subscribe to OperiX Cloud now? You can also do it later from Settings → Billing.</p>
          <div className="ob-toggle" role="group" aria-label="Billing period">
            <button type="button" className={interval === "annual" ? "on" : ""} onClick={() => setInterval("annual")}>Yearly <span className="ob-badge ob-badge-green">Save {savings}%</span></button>
            <button type="button" className={interval === "monthly" ? "on" : ""} onClick={() => setInterval("monthly")}>Monthly</button>
          </div>
          <div className="ob-price"><strong>{money(pricing[interval].base)}</strong><span>/{interval === "annual" ? "year" : "month"}</span><small>OperiX Invoice · {money(pricing[interval].additionalUser)} per extra user</small></div>
          <ul className="ob-checks">{cloudBenefits.map((benefit) => <li key={benefit}><Check size={15} />{benefit}</li>)}</ul>
          {message ? <p role="alert" className="form-error">{message}</p> : null}
          <div className="ob-actions">
            <button type="button" className="btn" onClick={() => window.location.assign("/dashboard")} disabled={busy}>Continue without subscribing</button>
            <button type="button" className="btn btn-primary" onClick={() => void subscribe()} disabled={busy}>{busy ? "Please wait…" : "Subscribe"}<ArrowRight size={16} /></button>
          </div>
          <p className="ob-note">Not ready? OperiX is always free: you can keep using it free in this browser (Settings → Data storage) at any time.</p>
        </> : null}
      </section>
    </div>
  </main>;
}
