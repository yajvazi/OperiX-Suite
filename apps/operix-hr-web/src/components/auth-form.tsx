"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useHrLocale } from "@/lib/i18n";
import { FormMessage, Spinner } from "./ui";
import { HrLogo } from "./product-logo";

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useHrLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem("operix-login-email");
    if (rememberedEmail) setEmail(rememberedEmail);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const client = createClient();
    if (!client) { setError("Sign-in is unavailable in this environment. Please contact your administrator."); return; }
    setBusy(true);
    await client.auth.signOut({ scope: "local" }).catch(() => {});
    const result = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (result.error) setError("The email or password you entered is incorrect.");
    else {
      if (rememberMe) window.localStorage.setItem("operix-login-email", email.trim());
      else window.localStorage.removeItem("operix-login-email");
      router.replace(params.get("next") || "/dashboard");
    }
    setBusy(false);
  }

  return <main className="login-page"><div className="login-art" aria-hidden="true"><div className="login-art-glow" /><div className="login-art-card"><div className="login-art-card-top"><span className="brand-dot" /><span>Today’s flow</span><strong>+18.4%</strong></div><div className="login-chart"><i /><i /><i /><i /><i /><i /><i /></div><div className="login-art-label"><span>People active</span><strong>48</strong></div></div><div className="login-art-copy"><span className="eyebrow">OperiX Suite</span><h2>Make every people process feel effortless.</h2><p>One calm workspace for your team, people, and payroll.</p></div></div><section className="login-panel"><HrLogo className="login-brand" /><div className="login-heading"><span className="eyebrow">Welcome back</span><h1>Sign in to HR</h1><p>Use the same OperiX account you use across the Suite.</p></div><form onSubmit={submit} className="login-form"><label>{t("email")}<div className="input-icon"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@company.com" /></div></label><label>{t("password")}<div className="input-icon"><LockKeyhole size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="••••••••" /></div></label>{error ? <FormMessage message={error} /> : null}<button type="submit" disabled={busy} className="button button-primary login-submit">{busy ? <Spinner /> : <>{t("signIn")}<ArrowRight size={17} /></>}</button></form><div className="login-footer"><span>Protected by your OperiX account</span><Link href="/auth/reset">Forgot password?</Link></div></section></main>;
}
