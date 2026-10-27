import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingError, createInvoiceApiAddonCheckoutSession } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  companyId: z.string().uuid().optional(),
  product: z.enum(["invoice", "booking", "suite"]).default("invoice"),
});

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  try {
    const body = requestSchema.parse(await request.json().catch(() => ({})));
    const session = await createInvoiceApiAddonCheckoutSession(request, client, user.id, body.companyId, body.product);
    return NextResponse.json(session, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    const message = caught instanceof BillingError ? caught.message : caught instanceof z.ZodError ? "Choose a valid OperiX product." : "API Add-on checkout could not be created.";
    const status = caught instanceof BillingError ? caught.status : caught instanceof z.ZodError ? 400 : 500;
    if (!(caught instanceof BillingError) && !(caught instanceof z.ZodError)) console.error("API Add-on checkout creation failed", caught instanceof Error ? caught.message : "unknown error");
    return NextResponse.json({ error: message }, { status });
  }
}
