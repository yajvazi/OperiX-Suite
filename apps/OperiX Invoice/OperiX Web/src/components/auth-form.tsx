"use client";

import { LanguageSwitch } from "./language-switch";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { InvoiceLogo } from "./product-logo";
import { SocialAuthButtons } from "./social-auth-buttons";
import { getUiLanguage } from "@/lib/i18n/language";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  // Sign-in is by emailed one-time code; the password form stays available as a fallback.
  const [usePassword, setUsePassword] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [lang, setLang] = useState<"en" | "sq">("en");
  const sq = lang === "sq";

  useEffect(() => { const timer = window.setTimeout(() => setLang(getUiLanguage()), 0); return () => window.clearTimeout(timer); }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (search.get("error") === "oauth") queueMicrotask(() => setMessage("Sign-in with that account did not complete. Please try again."));
  }, [search]);

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem("operix-login-email");
    if (!rememberedEmail) return;
    const timer = window.setTimeout(() => setEmail(rememberedEmail), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function finishSignIn() {
    if (rememberMe) window.localStorage.setItem("operix-login-email", email.trim());
    else window.localStorage.removeItem("operix-login-email");
    const requestedPath = search.get("next");
    const nextPath = requestedPath && requestedPath.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/dashboard";
    window.location.assign(nextPath);
  }

  async function sendCode() {
    if (loading || resendIn > 0) return;
    setMessage("");
    if (!email.trim()) { setMessage(sq ? "Shkruani emailin tuaj." : "Enter your email address."); return; }
    const supabase = isSupabaseConfigured ? createClient() : null;
    if (!supabase) { setMessage(sq ? "Hyrja nuk është e disponueshme tani. Provoni përsëri pas pak." : "Sign-in is unavailable right now. Please try again in a moment."); return; }
    setLoading(true);
    try {
      // Sign-in only: an unknown address must not silently create an account.
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` } });
      if (error) {
        const text = error.message.toLowerCase();
        if (error.status === 429 || text.includes("rate limit") || text.includes("seconds")) setMessage(sq ? "Shumë kërkesa. Prisni pak dhe provoni përsëri." : "Too many requests. Please wait a moment and try again.");
        else if (text.includes("signup") || text.includes("not found")) setMessage(sq ? "Nuk ka llogari me këtë email. Krijoni një llogari më poshtë." : "There is no account with this email. Create one below.");
        else setMessage(sq ? "Nuk mund ta dërgojmë kodin. Provoni përsëri." : "We couldn't send the code. Please try again.");
        return;
      }
      setCodeSent(true);
      setCode("");
      setResendIn(60);
    } catch {
      setMessage(sq ? "Hyrja nuk është e disponueshme tani. Provoni përsëri pas pak." : "Sign-in is unavailable right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(typed?: string) {
    const token = (typed ?? code).trim();
    if (loading) return;
    if (!token) { setMessage(sq ? "Shkruani kodin 6-shifror." : "Enter the 6-digit code."); return; }
    const supabase = isSupabaseConfigured ? createClient() : null;
    if (!supabase) return;
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
      if (error) { setMessage(sq ? "Kodi është i pasaktë ose ka skaduar." : "The code is incorrect or has expired."); setLoading(false); return; }
      finishSignIn();
    } catch {
      setMessage(sq ? "Hyrja nuk është e disponueshme tani. Provoni përsëri pas pak." : "Sign-in is unavailable right now. Please try again in a moment.");
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter in the email or code field acts as the main button of the current step.
    if (mode === "login" && !usePassword) { if (codeSent) await verifyCode(); else await sendCode(); return; }
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

      if (mode === "login") finishSignIn();
      else window.location.assign(search.get("next")?.startsWith("/") && !search.get("next")?.startsWith("//") ? String(search.get("next")) : "/dashboard");
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
          {isLogin && !usePassword ? (<>
            <label>Email address<div className="input-icon"><Mail size={17} /><input value={email} onChange={(event) => setEmail(event.target.value)} name="email" type="email" autoComplete="email" placeholder="you@company.com" required readOnly={codeSent} /></div></label>
            {codeSent ? (<>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{sq ? `Dërguam një kod 6-shifror te ${email.trim()}.` : `We sent a 6-digit code to ${email.trim()}.`}</p>
              <label>{sq ? "Kodi i hyrjes" : "Sign-in code"}<div className="input-icon"><LockKeyhole size={17} /><input value={code} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 6); setCode(digits); if (digits.length === 6) void verifyCode(digits); }} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus style={{ letterSpacing: "0.4em", fontWeight: 700 }} /></div></label>
            </>) : null}
            {message ? <p role="alert" className="form-error">{message}</p> : null}
            <button className="btn btn-primary login-submit" disabled={loading}>{loading ? (sq ? "Ju lutem prisni…" : "Please wait…") : codeSent ? (sq ? "Verifiko kodin" : "Verify code") : (sq ? "Dërgo kodin" : "Send me a code")}<ArrowRight size={17} /></button>
            {codeSent ? (<>
              <button type="button" className="btn" disabled={loading || resendIn > 0} onClick={() => void sendCode()}>{resendIn > 0 ? (sq ? `Dërgo kodin përsëri (${resendIn}s)` : `Send the code again (${resendIn}s)`) : (sq ? "Dërgo kodin përsëri" : "Send the code again")}</button>
              <button type="button" className="btn" onClick={() => { setCodeSent(false); setCode(""); setMessage(""); }}>{sq ? "Ndrysho emailin" : "Use a different email"}</button>
            </>) : null}
            <button type="button" className="btn" onClick={() => { setUsePassword(true); setMessage(""); }}>{sq ? "Hyr me fjalëkalim" : "Sign in with a password"}</button>
          </>) : (<>
            <label>Email address<div className="input-icon"><Mail size={17} /><input value={email} onChange={(event) => setEmail(event.target.value)} name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></div></label>
            <label>Password<div className="input-icon"><LockKeyhole size={17} /><input value={password} onChange={(event) => setPassword(event.target.value)} name="password" type="password" minLength={6} autoComplete={isLogin ? "current-password" : "new-password"} placeholder="••••••••" required /></div></label>
            {message ? <p role="alert" className="form-error">{message}</p> : null}
            <button className="btn btn-primary login-submit" disabled={loading}>{loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}<ArrowRight size={17} /></button>
            {isLogin ? <button type="button" className="btn" onClick={() => { setUsePassword(false); setMessage(""); }}>{sq ? "Hyr me kod me email" : "Use an emailed code instead"}</button> : null}
          </>)}
        </form>
        <SocialAuthButtons next={search.get("next")} onError={setMessage} />
        <div className="login-footer">{isLogin ? <span>Protected by your OperiX account</span> : <span>Already have an account? <Link href="/login">Sign in</Link></span>}{isLogin ? <Link href="/auth/reset">Forgot password?</Link> : null}</div>
        <div className="mt-4 flex justify-center"><LanguageSwitch compact /></div>
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
