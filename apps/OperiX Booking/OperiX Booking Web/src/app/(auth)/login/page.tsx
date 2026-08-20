"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isBookingDemoMode } from "@/lib/supabase/config";
import { BookingLogo } from "@/components/product-logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const demo = isBookingDemoMode;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) { window.location.href = "/dashboard"; return; }
    const client = createClient();
    if (!client) { setError("Add the Supabase URL and publishable key to sign in."); return; }
    setLoading(true); setError("");
    await client.auth.signOut({ scope: "local" }).catch(() => {});
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) setError(result.error.message);
    else window.location.href = "/dashboard";
    setLoading(false);
  }

  return (
    <main className="login-page">
      <div className="login-art" aria-hidden="true">
        <div className="login-art-glow" />
        <div className="login-art-card">
          <div className="login-art-card-top"><span className="brand-dot" /><span>Today’s flow</span><strong>+18.4%</strong></div>
          <div className="login-chart"><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="login-art-label"><span>Bookings confirmed</span><strong>48</strong></div>
        </div>
        <div className="login-art-copy"><span className="eyebrow">OperiX Suite</span><h2>Make every booking feel effortless.</h2><p>One calm workspace for your team, customers, and schedule.</p></div>
      </div>
      <section className="login-panel">
        <BookingLogo className="login-brand" />
        <div className="login-heading"><span className="eyebrow">Welcome back</span><h1>Sign in to Booking</h1><p>Use the same OperiX account you use across the Suite.</p></div>
        <form className="login-form" onSubmit={submit}>
          <label>Email address<div className="input-icon"><Mail size={17} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></div></label>
          <label>Password<div className="input-icon"><LockKeyhole size={17} /><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required /></div></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button login-submit" type="submit" disabled={loading}>{loading ? "Signing in…" : demo ? "Open demo workspace" : "Sign in"}<ArrowRight size={17} /></button>
        </form>
        <div className="login-footer"><span>Protected by your OperiX account</span><a href="/public/demo">View public booking page</a></div>
      </section>
    </main>
  );
}
