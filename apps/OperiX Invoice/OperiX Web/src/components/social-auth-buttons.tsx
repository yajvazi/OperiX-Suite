"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

type Provider = "google" | "apple";

function safeNextPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

/** "Continue with Google / Apple". Only the providers switched on in Supabase Auth are shown. */
export function SocialAuthButtons({ next, onError }: { next: string | null; onError: (message: string) => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [busy, setBusy] = useState<Provider | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: supabaseKey } })
      .then((response) => (response.ok ? response.json() : null))
      .then((settings: { external?: Record<string, boolean> } | null) => {
        if (active && settings) setProviders((["google", "apple"] as const).filter((provider) => settings.external?.[provider] === true));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!providers.length) return null;

  async function start(provider: Provider) {
    const supabase = createClient();
    if (!supabase) { onError("Authentication is temporarily unavailable. Please try again in a moment."); return; }
    setBusy(provider);
    onError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}` },
    });
    if (error) { onError("We couldn't start the sign-in. Please try again."); setBusy(null); }
  }

  return <div className="social-auth">
    <div className="social-divider"><span>or</span></div>
    {providers.map((provider) => <button key={provider} type="button" className={`btn social-button social-${provider}`} disabled={busy !== null} onClick={() => void start(provider)}>
      {provider === "google" ? <GoogleMark /> : <AppleMark />}
      {busy === provider ? "Please wait…" : provider === "google" ? "Continue with Google" : "Continue with Apple"}
    </button>)}
  </div>;
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
}

function AppleMark() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.37 1.43c0 1.14-.46 2.22-1.2 3-.8.84-2.1 1.5-3.16 1.41-.13-1.1.42-2.25 1.15-3 .82-.86 2.2-1.5 3.21-1.41zM20.5 17.1c-.55 1.27-.82 1.84-1.53 2.96-1 1.57-2.4 3.52-4.14 3.54-1.55.02-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.74-.02-3.07-1.78-4.07-3.35C-.1 15.9-.4 10.7 1.4 7.93c1.28-1.97 3.3-3.12 5.2-3.12 1.93 0 3.14 1.06 4.74 1.06 1.55 0 2.5-1.06 4.73-1.06 1.69 0 3.48.92 4.75 2.51-4.17 2.28-3.5 8.22.68 9.78z"/></svg>;
}
