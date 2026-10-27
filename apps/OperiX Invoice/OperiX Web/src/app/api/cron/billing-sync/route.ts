import { NextResponse } from "next/server";
import { applyScheduledInvoicePlanChanges, expireInvoiceTrials, processInvoiceBillingSyncQueue } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-cron-secret");
  return header === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const expiredTrials = await expireInvoiceTrials();
    const sync = await processInvoiceBillingSyncQueue();
    const scheduledPlanChanges = await applyScheduledInvoicePlanChanges();
    return NextResponse.json({ expiredTrials, sync, scheduledPlanChanges }, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    console.error("Invoice billing cron failed", caught instanceof Error ? caught.message : "unknown error");
    return NextResponse.json({ error: "Billing maintenance failed." }, { status: 500 });
  }
}
