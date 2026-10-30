import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only same-site paths are allowed as the post-login destination (no open redirect).
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/dashboard";
}

// Behind a reverse proxy the request URL carries the container's internal address (0.0.0.0:3000),
// so redirects are built from the configured public address, then the forwarded host, then the request.
function publicOrigin(request: Request) {
  const configured = (process.env.NEXT_PUBLIC_INVOICE_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (/^https?:\/\//.test(configured)) return configured;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host && !host.startsWith("0.0.0.0")) return `${request.headers.get("x-forwarded-proto") || "https"}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (url.searchParams.get("error")) return NextResponse.redirect(new URL("/login?error=oauth", origin));
  const supabase = await createClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
