"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Download, LockKeyhole, Mail } from "lucide-react";
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
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    if (result.error) { setMessage(result.error.message); setLoading(false); return; }
    if (mode === "signup" && !result.data.session) { setMessage("Check your email to confirm your account."); setLoading(false); return; }
    router.push(search.get("next") || "/dashboard"); router.refresh();
  }

  return <main className="min-h-screen grid lg:grid-cols-[minmax(420px,540px)_1fr] bg-white">
    <section className="flex flex-col p-7 sm:p-12 lg:p-16 max-w-[540px] w-full mx-auto">
      <Brand dark />
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
        <div className="mt-10 border-t border-[#e4e9f0] pt-7 flex items-center gap-3 text-[12px] muted"><Download size={17} className="text-[#004ffe]"/><span>Prefer mobile? App Store and Google Play links are available after sign-in.</span></div>
      </div>
      <p className="text-[11px] muted">© 2026 OperiX Invoice. Secure business software.</p>
    </section>
    <section className="hidden lg:flex relative overflow-hidden bg-[#061a38] text-white p-16 items-center justify-center">
      <div className="absolute inset-0 opacity-20" style={{backgroundImage:"radial-gradient(circle at 70% 20%, #3388ff 0, transparent 28%), linear-gradient(145deg, transparent 55%, #004ffe 150%)"}}/>
      <div className="relative max-w-xl"><p className="text-[#8cc2ff] font-semibold mb-5">Smart invoicing. Stronger business.</p><h2 className="text-[48px] leading-[1.12] font-semibold tracking-[-.05em]">One clear view of every invoice, payment and decision.</h2><div className="mt-12 grid grid-cols-3 gap-3"><AuthStat value="A4 + 50 mm" label="Professional print"/><AuthStat value="Real-time" label="Business reports"/><AuthStat value="Secure" label="Company access"/></div></div>
    </section>
  </main>;
}

function AuthStat({ value, label }: { value: string; label: string }) { return <div className="border-t border-white/20 pt-4"><strong className="block text-lg">{value}</strong><span className="text-white/60 text-xs">{label}</span></div>; }
