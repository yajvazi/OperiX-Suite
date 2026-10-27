import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingError, changeInvoicePlan } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const requestSchema = z.object({
  currentPlan: z.enum(["invoice", "suite"]),
  targetPlan: z.enum(["invoice", "suite"]),
  interval: z.enum(["monthly", "annual"]).optional(),
  companyId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  try {
    const body = requestSchema.parse(await request.json());
    const result = await changeInvoicePlan(request, client, user.id, body.currentPlan, body.targetPlan, body.interval, body.companyId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    const message = caught instanceof BillingError ? caught.message : caught instanceof z.ZodError ? "Choose a valid Invoice or Suite plan change." : "The plan change could not be completed.";
    const status = caught instanceof BillingError ? caught.status : caught instanceof z.ZodError ? 400 : 500;
    if (!(caught instanceof BillingError) && !(caught instanceof z.ZodError)) console.error("Invoice plan change failed", caught instanceof Error ? caught.message : "unknown error");
    return NextResponse.json({ error: message }, { status });
  }
}
