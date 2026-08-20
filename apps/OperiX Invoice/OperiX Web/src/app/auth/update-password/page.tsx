"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Moon, Sun } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useTheme } from "@/components/theme-provider";

export default function UpdatePasswordPage() {
  const { theme, toggleTheme } = useTheme();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [updated, setUpdated] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 6) {
      setMessage("Use at least 6 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    const supabase = createClient();
    if (!isSupabaseConfigured || !supabase) {
      setMessage("Password recovery is unavailable in this environment. Please contact your administrator.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMessage("We couldn't update your password. Please request a new reset link and try again.");
    else setUpdated(true);
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
          <h1>{updated ? "Password updated" : "Create a new password"}</h1>
          <p>{updated ? "Your OperiX password has been changed successfully." : "Choose a secure password for your OperiX account."}</p>
          {message ? <p role="alert" className="auth-form-message">{message}</p> : null}
          {updated ? <Link href="/login" className="btn btn-primary auth-reset-return">Return to sign in <ArrowRight size={16} /></Link> : <form onSubmit={submit} className="auth-reset-form"><label>New password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" required /></label><label>Confirm password<input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required /></label><small className="auth-password-help">Use at least 6 characters.</small><button className="btn btn-primary" disabled={loading}>{loading ? "Updating…" : "Update password"}<ArrowRight size={16} /></button></form>}
        </div>
      </section>
    </main>
  );
}
