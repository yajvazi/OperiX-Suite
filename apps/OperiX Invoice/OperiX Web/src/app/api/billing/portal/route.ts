import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingError, createInvoicePortalSession } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const requestSchema = z.object({ companyId: z.string().uuid().optional() }).optional();

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  try {
    const body = requestSchema.parse(await request.json().catch(() => ({})));
    const session = await createInvoicePortalSession(request, client, user.id, body?.companyId);
    return NextResponse.json(session, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    const message = caught instanceof BillingError ? caught.message : caught instanceof z.ZodError ? "The workspace selection is invalid." : "The billing portal could not be opened.";
    const status = caught instanceof BillingError ? caught.status : caught instanceof z.ZodError ? 400 : 500;
    if (!(caught instanceof BillingError) && !(caught instanceof z.ZodError)) console.error("Invoice portal session failed", caught instanceof Error ? caught.message : "unknown error");
    return NextResponse.json({ error: message }, { status });
  }
}
