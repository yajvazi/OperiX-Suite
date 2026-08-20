"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/safe-navigation";
import { ControlLogo } from "./product-logo";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = createClient();
    if (!client) { setError("Supabase is not configured for this environment."); return; }
    setPending(true);
    setError("");
    await client.auth.signOut({ scope: "local" }).catch(() => {});
    const result = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (result.error) {
      setError(result.error.message);
      setPending(false);
      return;
    }
    router.replace(safeNextPath(searchParams.get("next")));
    router.refresh();
  }

  return <main className="login-page"><div className="login-art" aria-hidden="true"><div className="login-art-glow" /><div className="login-art-card"><div className="login-art-card-top"><span className="brand-dot" /><span>Today’s flow</span><strong>+18.4%</strong></div><div className="login-chart"><i /><i /><i /><i /><i /><i /><i /></div><div className="login-art-label"><span>Workspaces governed</span><strong>48</strong></div></div><div className="login-art-copy"><span className="eyebrow">OperiX Suite</span><h2>Keep every workspace in control.</h2><p>One calm command center for your team and the entire Suite.</p></div></div><section className="login-panel"><ControlLogo className="login-brand" /><div className="login-heading"><span className="eyebrow">Welcome back</span><h1>Sign in to Control</h1><p>Use the same OperiX account you use across the Suite.</p></div>{!isSupabaseConfigured ? <div className="callout callout-warning login-callout"><strong>Environment setup required</strong><span>This app is ready for the shared account flow once Supabase variables are provided.</span></div> : null}<form className="login-form" onSubmit={submit}><label>Email address<div className="input-icon"><Mail size={17} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></div></label><label>Password<div className="input-icon"><LockKeyhole size={17} /><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></div></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="button button-primary login-submit" type="submit" disabled={pending || !isSupabaseConfigured}>{pending ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button></form><div className="login-footer"><span>Protected by your OperiX account</span><span><LockKeyhole size={11} /> Shared suite access</span></div></section></main>;
}
