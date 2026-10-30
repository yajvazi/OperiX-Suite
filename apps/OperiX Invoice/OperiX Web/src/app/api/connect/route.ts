import { NextResponse } from "next/server";

// Public on purpose: the mobile app calls this before anyone has signed in to learn which
// backend belongs to this web app. It only returns values that are already shipped to every
// browser (the Supabase address and its publishable key); no secret ever goes through here.
export function GET() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  return NextResponse.json({
    app: "operix-invoice",
    version: 1,
    name: (process.env.NEXT_PUBLIC_SERVER_NAME ?? "").trim() || "OperiX Invoice",
    supabaseUrl,
    supabaseKey,
  }, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
