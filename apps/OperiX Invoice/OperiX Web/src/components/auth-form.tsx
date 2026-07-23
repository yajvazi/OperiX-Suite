"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Download, LockKeyhole, Mail, Play } from "lucide-react";
import { Brand } from "./brand";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const search = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setLoading(true); setMessage("");
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    if (!isSupabaseConfigured) {
      setMessage("Authentication is unavailable because Supabase is not configured.");
      setLoading(false);
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    try {
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
      if (result.error) { setMessage(formatAuthError(result.error.message)); setLoading(false); return; }
      if (mode === "signup" && !result.data.session) { setMessage("Check your email to confirm your account."); setLoading(false); return; }
      router.push(search.get("next") || "/dashboard"); router.refresh();
    } catch {
      setMessage("Authentication is temporarily unavailable. Please try again in a moment.");
      setLoading(false);
    }
  }

  return <main className="min-h-screen grid lg:grid-cols-[minmax(420px,540px)_1fr] bg-white">
    <section className="flex flex-col p-7 sm:p-12 lg:p-16 max-w-[540px] w-full mx-auto">
      <div className="auth-brand flex justify-center"><Brand dark /></div>
      <div className="my-auto py-14">
        <h1 className="text-[32px] leading-tight font-semibold tracking-[-.04em]">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="muted mt-3 mb-9">{mode === "login" ? "Sign in to manage invoices, payments and your business." : "Start managing your business with OperiX Invoice."}</p>
        <form action={submit} className="grid gap-5">
          <label className="field"><span>Email address</span><div className="relative"><Mail className="absolute left-3 top-3 text-[#98a2b3]" size={17}/><input className="input pl-10" name="email" type="email" autoComplete="email" placeholder="name@company.com" required/></div></label>
          <label className="field"><span>Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-3 text-[#98a2b3]" size={17}/><input className="input pl-10" name="password" type="password" minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 6 characters" required/></div></label>
          {message && <p role="alert" className="text-[13px] text-[#d92d20] bg-[#fff3f2] border border-[#ffd6d2] rounded-md p-3">{message}</p>}
          <button className="btn btn-primary w-full" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={17}/></button>
        </form>
        {!isSupabaseConfigured && <p className="mt-4 text-xs text-center text-[#d92d20]">Supabase configuration is required to use OperiX Invoice.</p>}
        <p className="text-center mt-7 text-[13px] muted">{mode === "login" ? "New to OperiX? " : "Already have an account? "}<Link className="text-[#004ffe] font-semibold" href={mode === "login" ? "/signup" : "/login"}>{mode === "login" ? "Create an account" : "Sign in"}</Link></p>
        {mode === "login" ? <div className="mt-5 text-center"><Link href="/demo" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#004ffe]">Explore the interactive demo <ArrowRight size={14}/></Link></div> : null}
        <div className="mt-10 border-t border-[#e4e9f0] pt-7 text-center"><div className="flex items-center justify-center gap-3 text-[12px] muted"><Download size={17} className="text-[#004ffe]"/><span>Prefer mobile? Download OperiX Invoice for iOS or Android.</span></div><div className="mt-4 flex justify-center gap-2"><a className="store-badge" href="https://apps.apple.com/" target="_blank" rel="noreferrer"><AppleLogo/><span><small>Download on the</small><strong>App Store</strong></span></a><a className="store-badge" href="https://play.google.com/store" target="_blank" rel="noreferrer"><Play size={15} fill="currentColor"/><span><small>GET IT ON</small><strong>Google Play</strong></span></a></div></div>
      </div>
      <p className="text-[11px] muted">© 2026 OperiX Invoice. Secure business software. <span>Part of </span><a className="text-[#004ffe]" href="https://operixsuite.com">OperiX Suite</a>.</p>
    </section>
    <section className="hidden lg:flex relative overflow-hidden bg-[#061a38] text-white p-16 items-center justify-center">
      <div className="absolute inset-0 opacity-20" style={{backgroundImage:"radial-gradient(circle at 70% 20%, #3388ff 0, transparent 28%), linear-gradient(145deg, transparent 55%, #004ffe 150%)"}}/>
      <div className="relative max-w-xl"><p className="text-[#8cc2ff] font-semibold mb-5">Smart invoicing. Stronger business.</p><h2 className="text-[48px] leading-[1.12] font-semibold tracking-[-.05em]">One clear view of every invoice, payment and decision.</h2><div className="mt-12 grid grid-cols-3 gap-3"><AuthStat value="Fast setup" label="Ready in minutes"/><AuthStat value="Real-time" label="Business reports"/><AuthStat value="Secure" label="Company access"/></div></div>
    </section>
  </main>;
}

function formatAuthError(message: string) {
  if (!message || message === "{}" || message === "[object Object]") {
    return "Authentication is temporarily unavailable. Please try again in a moment.";
  }
  return message;
}

function AuthStat({ value, label }: { value: string; label: string }) { return <div className="border-t border-white/20 pt-4"><strong className="block text-lg">{value}</strong><span className="text-white/60 text-xs">{label}</span></div>; }

function AppleLogo() {
  return <svg aria-hidden="true" viewBox="0 0 384 512" width="17" height="20" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.3-2.8-73.9 20.6-88 20.6-14.9 0-49.1-19.6-76.9-19.1-36.8.6-70.9 21.4-89.8 54.5-38 66-9.7 163.4 27.3 217 18.5 26.7 40.7 56.7 69.8 55.6 28-1.1 38.6-17.9 72.5-17.9 33.9 0 43.4 17.9 72.9 17.3 30.1-.6 49.2-27.2 67.6-53.9 21.3-31.1 30.1-61.1 30.7-62.7-.7-.3-58.9-22.6-59-87.6zM261.4 101.5c15.4-18.2 25.8-43.5 23-68.6-22.2.9-49 15.7-64.7 33.9-14.1 16.2-26.4 41.8-23.1 66.4 24.7 1.9 49.4-13.2 64.8-31.7z"/></svg>;
}
