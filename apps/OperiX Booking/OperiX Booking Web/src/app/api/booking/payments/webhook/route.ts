import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

export const runtime = "nodejs";

function validStripeSignature(payload: string, header: string, secret: string) {
  const values = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(values.t);
  const signature = values.v1;
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(String(timestamp) + "." + payload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !validStripeSignature(rawBody, signature, webhookSecret)) return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  const event = JSON.parse(rawBody) as { type?: string; data?: { object?: { id?: string; amount_total?: number; currency?: string; payment_status?: string; metadata?: Record<string, string> } } };
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return NextResponse.json({ received: true });
  const session = event.data?.object;
  const companyId = session?.metadata?.company_id;
  const bookingId = session?.metadata?.booking_id;
  if (!companyId || !bookingId || !session.id || session.payment_status !== "paid") return NextResponse.json({ received: true });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "Payment reconciliation is not configured." }, { status: 503 });
  const serverSupabaseUrl = process.env.SUPABASE_INTERNAL_URL?.trim() || supabaseUrl;
  const serviceClient = createSupabaseClient(serverSupabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await serviceClient.rpc("booking_reconcile_payment", { p_company_id: companyId, p_booking_id: bookingId, p_provider: "stripe", p_provider_payment_id: session.id, p_amount: Number(session.amount_total || 0) / 100, p_currency: String(session.currency || "eur").toUpperCase(), p_status: "succeeded", p_metadata: { stripe_event_type: event.type } });
  if (error) return NextResponse.json({ error: "Payment reconciliation failed." }, { status: 500 });
  return NextResponse.json({ received: true });
}
