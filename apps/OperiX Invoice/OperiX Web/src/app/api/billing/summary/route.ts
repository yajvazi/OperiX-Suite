import { NextResponse } from "next/server";
import { authorizeInvoiceWorkspace, BillingError } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  try {
    const companyId = new URL(request.url).searchParams.get("companyId") || undefined;
    const authorization = await authorizeInvoiceWorkspace(client, user.id, companyId);
    return NextResponse.json({
      summary: authorization.summary,
      companyId: authorization.companyId,
      rootCompanyId: authorization.rootCompanyId,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (caught) {
    const message = caught instanceof BillingError ? caught.message : "Billing information could not be loaded.";
    const status = caught instanceof BillingError ? caught.status : 500;
    if (!(caught instanceof BillingError)) console.error("Invoice billing summary failed", caught instanceof Error ? caught.message : "unknown error");
    return NextResponse.json({ error: message }, { status });
  }
}
