"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { InvoiceLogo } from "./product-logo";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem("operix-login-email");
    if (!rememberedEmail) return;
    const timer = window.setTimeout(() => setEmail(rememberedEmail), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (!isSupabaseConfigured) {
      setMessage(mode === "login"
        ? "Sign-in is unavailable in this environment. Please contact your administrator."
        : "Account creation is unavailable in this environment. Please contact your administrator.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setMessage("Authentication is temporarily unavailable. Please try again in a moment.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "login") await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });

      if (result.error) {
        setMessage(formatAuthError(result.error.message, mode));
        setLoading(false);
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setMessage("Check your email to confirm your OperiX account.");
        setLoading(false);
        return;
      }

      if (mode === "login") {
        if (rememberMe) window.localStorage.setItem("operix-login-email", email.trim());
        else window.localStorage.removeItem("operix-login-email");
      }
      router.push(search.get("next") || "/dashboard");
      router.refresh();
    } catch {
      setMessage("Authentication is temporarily unavailable. Please try again in a moment.");
      setLoading(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <main className="login-page">
      <div className="login-art" aria-hidden="true">
        <div className="login-art-glow" />
        <div className="login-art-card">
          <div className="login-art-card-top"><span className="brand-dot" /><span>Today’s flow</span><strong>+18.4%</strong></div>
          <div className="login-chart"><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="login-art-label"><span>Invoices sent</span><strong>48</strong></div>
        </div>
        <div className="login-art-copy"><span className="eyebrow">OperiX Suite</span><h2>Make every invoice feel effortless.</h2><p>One calm workspace for your team, customers, and cash flow.</p></div>
      </div>
      <section className="login-panel">
        <InvoiceLogo className="login-brand" />
        <div className="login-heading"><span className="eyebrow">Welcome back</span><h1>{isLogin ? "Sign in to Invoice" : "Create your Invoice account"}</h1><p>{isLogin ? "Use the same OperiX account you use across the Suite." : "Set up one secure account for every OperiX application."}</p></div>
        <form className="login-form" onSubmit={submit}>
          <label>Email address<div className="input-icon"><Mail size={17} /><input value={email} onChange={(event) => setEmail(event.target.value)} name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></div></label>
          <label>Password<div className="input-icon"><LockKeyhole size={17} /><input value={password} onChange={(event) => setPassword(event.target.value)} name="password" type="password" minLength={6} autoComplete={isLogin ? "current-password" : "new-password"} placeholder="••••••••" required /></div></label>
          {message ? <p role="alert" className="form-error">{message}</p> : null}
          <button className="btn btn-primary login-submit" disabled={loading}>{loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}<ArrowRight size={17} /></button>
        </form>
        <div className="login-footer">{isLogin ? <span>Protected by your OperiX account</span> : <span>Already have an account? <Link href="/login">Sign in</Link></span>}{isLogin ? <Link href="/auth/reset">Forgot password?</Link> : null}</div>
      </section>
    </main>
  );
}

function formatAuthError(message: string, mode: "login" | "signup") {
  const normalized = message.toLowerCase();
  if (mode === "login") return "The email or password you entered is incorrect.";
  if (normalized.includes("already registered") || normalized.includes("already exists")) return "An account with this email already exists.";
  if (normalized.includes("password")) return "Please choose a password with at least 6 characters.";
  return "We couldn't create your account. Please check your details and try again.";
}
