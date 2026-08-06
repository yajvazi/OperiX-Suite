"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = createClient();
    if (!client) { setError("Supabase is not configured for this environment."); return; }
    setPending(true); setError(null);
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) { setError(result.error.message); setPending(false); return; }
    router.replace(searchParams.get("next") || "/dashboard");
    router.refresh();
  }

  return <form className="grid gap-5" onSubmit={submit}>
    <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label className="field"><span>Password</span><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error ? <p className="rounded-md border border-[#fecdca] bg-[#fff3f2] p-3 text-xs text-[#b42318]" role="alert">{error}</p> : null}
    <button className="btn btn-primary w-full" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
  </form>;
}
