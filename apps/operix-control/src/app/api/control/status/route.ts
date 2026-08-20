import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const services = [
  { key: "auth", name: "Authentication", url: "/auth/v1/settings" },
  { key: "database", name: "Database", url: "/rest/v1/" },
  { key: "invoice", name: "OperiX Invoice", url: "https://invoice.operixsuite.com/api/health" },
  { key: "hr", name: "OperiX HR", url: "https://hr.operixsuite.com/api/health" },
  { key: "booking", name: "OperiX Booking", url: "https://booking.operixsuite.com/api/health" },
  { key: "desk", name: "OperiX Desk", url: "https://desk.operixsuite.com/api/health" },
  { key: "support", name: "OperiX Support", url: "https://support.operixsuite.com/api/health" },
  { key: "email", name: "Email", url: "" },
  { key: "payments", name: "Payments", url: "" },
];

function absoluteUrl(url: string) {
  if (!url.startsWith("/")) return url;
  const base = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
  return base ? `${base}${url}` : "";
}

export async function GET() {
  if (!isSupabaseConfigured) return NextResponse.json({ error: "Control is not configured." }, { status: 503 });
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: profile } = await client.from("profiles").select("active_company_id,company_id").eq("id", user.id).maybeSingle();
  const companyId = profile?.active_company_id || profile?.company_id;
  if (!companyId) return NextResponse.json({ error: "Organization context is missing." }, { status: 403 });
  const { data: allowed } = await client.rpc("control_has_permission", { p_company_id: companyId, p_permission: "status.read" });
  if (allowed !== true) return NextResponse.json({ error: "Status permission required." }, { status: 403 });

  const results = await Promise.all(services.map(async (service) => {
    const url = absoluteUrl(service.url);
    if (!url) return { ...service, status: "Unknown", detail: "No health endpoint is configured." };
    const started = Date.now();
    try {
      const response = await fetch(url, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      const detail = response.ok ? `${response.status} · ${Date.now() - started} ms` : `HTTP ${response.status}`;
      return { ...service, status: response.ok ? "Operational" : response.status >= 500 ? "Issue" : "Degraded", detail };
    } catch {
      return { ...service, status: "Unknown", detail: "Health endpoint did not respond." };
    }
  }));
  return NextResponse.json({ services: results, checkedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
