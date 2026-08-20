"use client";

import Link from "next/link";
import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, FormMessage } from "@/components/ui";
import { useTheme } from "@/components/theme-provider";

export default function ResetPage() {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError("");
    const client = createClient();
    if (!client) { setError("Password recovery is unavailable in this environment. Please contact your administrator."); return; }
    const result = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/reset` });
    if (result.error) setError("We couldn't send the reset link. Please check your email and try again."); else setMessage("If an account exists for that email, a reset link is on its way.");
  }
  return <main className="auth-page auth-simple"><section className="auth-panel"><div className="auth-panel-top"><button type="button" className="icon-button auth-theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button><Link href="/login" className="text-link">Back to sign in</Link></div><div className="auth-form-wrap"><div className="auth-mobile-brand"><span className="brand-mark">O</span><strong>OperiX</strong></div><h2>Reset your password</h2><p className="auth-description">Enter your email and we’ll send you a reset link.</p>{error ? <FormMessage message={error} /> : null}{message ? <FormMessage message={message} tone="success" /> : null}<form onSubmit={submit} className="auth-form"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><Button type="submit">Send reset link</Button></form></div></section></main>;
}
