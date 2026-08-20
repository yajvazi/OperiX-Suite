"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Moon, Send, Sun } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useTheme } from "@/components/theme-provider";

export default function ResetPasswordPage() {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    if (!isSupabaseConfigured) {
      setMessage("Password recovery is unavailable in this environment. Please contact your administrator.");
      setLoading(false);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setMessage("We couldn't send the reset link. Please try again.");
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/callback?next=/auth/update-password` });
    if (error) setMessage("We couldn't send the reset link. Please check your email and try again.");
    else setSent(true);
    setLoading(false);
  }

  return (
    <main className="auth-simple auth-reset-page">
      <section className="auth-reset-panel">
        <div className="auth-reset-topbar">
          <Link href="/login" className="auth-back-link"><ArrowLeft size={16} /> Back to sign in</Link>
          <button type="button" className="auth-theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
        </div>
        <div className="auth-reset-content">
          <div className="auth-mobile-brand"><Image src="/operix-icon.svg" width={30} height={30} alt="" priority /><strong>OperiX</strong></div>
          <h1>{sent ? "Check your email" : "Reset your password"}</h1>
          <p>{sent ? "If an account exists for this email, we sent a secure reset link." : "Enter your email and we'll send you a reset link."}</p>
          {message ? <p role="alert" className="auth-form-message">{message}</p> : null}
          {sent ? <div className="auth-reset-success"><CheckCircle2 size={18} /><span>Open the link in your email to create a new password.</span></div> : <form onSubmit={submit} className="auth-reset-form"><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@company.com" required /></label><button className="btn btn-primary" disabled={loading}>{loading ? "Sending…" : "Send reset link"}<Send size={16} /></button></form>}
          {!sent ? <Link href="/login" className="auth-reset-secondary">Back to sign in</Link> : <Link href="/login" className="btn btn-primary auth-reset-return">Return to sign in</Link>}
        </div>
      </section>
    </main>
  );
}
