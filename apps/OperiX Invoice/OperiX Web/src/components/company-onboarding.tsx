"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearWorkspaceSnapshot } from "@/hooks/use-workspace";
import { InvoiceLogo } from "./product-logo";

/** First step for accounts that have no company yet, for example after the first Google or Apple sign-in. */
export function CompanyOnboarding() {
  const [company, setCompany] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    void supabase?.auth.getUser().then(({ data }) => {
      const meta = (data.user?.user_metadata || {}) as Record<string, unknown>;
      const full = String(meta.full_name || meta.name || "").trim();
      setFirstName((current) => current || String(meta.given_name || full.split(" ")[0] || ""));
      setLastName((current) => current || String(meta.family_name || full.split(" ").slice(1).join(" ") || ""));
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) { setMessage("Authentication is temporarily unavailable. Please try again in a moment."); return; }
    if (!company.trim()) { setMessage("Enter your company name."); return; }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("complete_signup_onboarding", {
      p_tenant_name: company.trim(), p_first_name: firstName.trim(), p_last_name: lastName.trim(), p_phone: phone.trim(), p_tax_id: taxId.trim(),
    });
    if (error) { setMessage("The workspace could not be created. Please try again."); setBusy(false); return; }
    clearWorkspaceSnapshot();
    window.location.assign("/dashboard");
  }

  async function signOut() {
    await createClient()?.auth.signOut();
    window.location.assign("/login");
  }

  return <main className="login-page" style={{ display: "grid", placeItems: "center", padding: 24 }}>
    <section className="login-panel" style={{ maxWidth: 480, width: "100%", borderRadius: 18, boxShadow: "0 12px 40px rgba(6,26,56,.12)" }}>
      <InvoiceLogo className="login-brand" />
      <div className="login-heading" style={{ margin: "28px 0 20px" }}>
        <span className="eyebrow"><Building2 size={13} style={{ display: "inline", marginRight: 6 }} />Almost there</span>
        <h1>Set up your company</h1>
        <p>You are signed in. Tell us about your business to create your workspace.</p>
      </div>
      <form className="login-form" onSubmit={submit}>
        <label>Company name *<div className="input-icon"><input value={company} onChange={(event) => setCompany(event.target.value)} name="company" required autoFocus /></div></label>
        <label>First name<div className="input-icon"><input value={firstName} onChange={(event) => setFirstName(event.target.value)} name="firstName" autoComplete="given-name" /></div></label>
        <label>Last name<div className="input-icon"><input value={lastName} onChange={(event) => setLastName(event.target.value)} name="lastName" autoComplete="family-name" /></div></label>
        <label>Phone (optional)<div className="input-icon"><input value={phone} onChange={(event) => setPhone(event.target.value)} name="phone" type="tel" autoComplete="tel" /></div></label>
        <label>Business registration number (optional)<div className="input-icon"><input value={taxId} onChange={(event) => setTaxId(event.target.value)} name="taxId" /></div></label>
        {message ? <p role="alert" className="form-error">{message}</p> : null}
        <button className="btn btn-primary login-submit" disabled={busy}>{busy ? "Please wait…" : "Create workspace"}</button>
      </form>
      <div className="login-footer"><button type="button" onClick={() => void signOut()} className="link-button" style={{ color: "#004ffe", fontWeight: 600 }}>Sign out</button></div>
    </section>
  </main>;
}
