import { NextResponse } from "next/server";
import { processBookingInvoiceJobs } from "@/lib/booking-invoice-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_JOB_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processBookingInvoiceJobs(25);
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Booking invoice automation worker failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "The automation worker could not complete." }, { status: 500 });
  }
}
