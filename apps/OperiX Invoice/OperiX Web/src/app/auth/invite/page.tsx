"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function InvitationPageContent() {
  const params = useSearchParams();
  const operationId = useMemo(() => params.get("operation") || "", [params]);
  const client = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!operationId || !client) {
      return;
    }
    client.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) setMessage("Please open this page from the invitation email or sign in first.");
      setLoading(false);
    });
  }, [client, operationId]);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!client || !operationId) {
      setMessage("This invitation link is invalid or expired.");
      return;
    }
    if (password.length < 6) {
      setMessage("Use at least 6 characters for your password.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: passwordError } = await client.auth.updateUser({ password });
    if (passwordError) {
      setMessage("We could not set your password. Please request a new invitation.");
      setLoading(false);
      return;
    }
    const response = await fetch("/api/users-access/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationId }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(result.error || "We could not activate your company access.");
    else setAccepted(true);
    setLoading(false);
  }

  return (
    <main className="auth-simple auth-reset-page">
      <section className="auth-reset-panel">
        <div className="auth-reset-content">
          <div className="auth-mobile-brand"><strong>OperiX Invoice</strong></div>
          <h1>{accepted ? "You're in" : "Accept your invitation"}</h1>
          <p>{accepted ? "Your company access is active. You can now open OperiX Invoice." : "Set a password to finish joining your company workspace."}</p>
          {message ? <p role="alert" className="auth-form-message">{message}</p> : null}
          {accepted ? <div className="auth-reset-success"><CheckCircle2 size={18} /><span>Your role and company permissions were assigned by the company administrator.</span></div> : !operationId || !client ? <p role="alert" className="auth-form-message">This invitation link is invalid or expired.</p> : loading ? <p>Checking your secure invitation…</p> : <form onSubmit={accept} className="auth-reset-form"><label><LockKeyhole size={15} /> Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" required /></label><label>Confirm password<input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required /></label><small className="auth-password-help">Use at least 6 characters.</small><button className="btn btn-primary" disabled={loading}>{loading ? "Activating…" : "Accept invitation"}<ArrowRight size={16} /></button></form>}
          {accepted ? <Link href="/dashboard" className="btn btn-primary auth-reset-return">Open OperiX Invoice <ArrowRight size={16} /></Link> : <Link href="/login" className="auth-reset-secondary">Sign in with another account</Link>}
        </div>
      </section>
    </main>
  );
}

export default function InvitationPage() {
  return <Suspense fallback={<main className="auth-simple auth-reset-page"><section className="auth-reset-panel"><div className="auth-reset-content"><div className="auth-mobile-brand"><strong>OperiX Invoice</strong></div><h1>Accept your invitation</h1><p>Checking your secure invitation…</p></div></section></main>}><InvitationPageContent /></Suspense>;
}
