import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingError, createInvoicePlanCheckoutSession } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const requestSchema = z.object({
  plan: z.enum(["invoice", "suite"]).default("invoice"),
  interval: z.enum(["monthly", "annual"]),
  companyId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  try {
    const body = requestSchema.parse(await request.json());
    const session = await createInvoicePlanCheckoutSession(request, client, user.id, body.plan, body.interval, body.companyId);
    return NextResponse.json(session, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    const message = caught instanceof BillingError ? caught.message : caught instanceof z.ZodError ? "Choose a valid Invoice or Suite plan and billing interval." : "Checkout could not be created.";
    const status = caught instanceof BillingError ? caught.status : caught instanceof z.ZodError ? 400 : 500;
    if (!(caught instanceof BillingError) && !(caught instanceof z.ZodError)) console.error("Invoice checkout creation failed", caught instanceof Error ? caught.message : "unknown error");
    return NextResponse.json({ error: message }, { status });
  }
}
