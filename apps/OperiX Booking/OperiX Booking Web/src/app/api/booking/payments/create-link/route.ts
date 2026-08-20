import { NextResponse } from "next/server";
import { resolveWorkspace } from "@invoice-monorepo/api/workspace";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { bookingId?: string };
  if (!body.bookingId) return NextResponse.json({ error: "A booking is required." }, { status: 400 });
  const workspace = await resolveWorkspace(client, authData.user.id);
  const { data: allowed, error: permissionError } = await client.rpc("booking_has_permission", { p_company_id: workspace.companyId, p_permission: "payment.manage" });
  if (permissionError || !allowed) return NextResponse.json({ error: "You do not have permission to create payment links." }, { status: 403 });
  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("id,company_id,booking_number,total_amount,deposit_amount,paid_amount,currency,service:booking_services(name)")
    .eq("company_id", workspace.companyId)
    .eq("id", body.bookingId)
    .single();
  if (bookingError || !booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Stripe is not configured for this OperiX workspace." }, { status: 503 });
  const outstanding = Math.max(0, Number(booking.total_amount || 0) - Number(booking.paid_amount || 0));
  const amount = Number(booking.deposit_amount || 0) > 0 && Number(booking.paid_amount || 0) === 0 ? Number(booking.deposit_amount) : outstanding;
  if (amount <= 0) return NextResponse.json({ error: "This booking has no outstanding balance." }, { status: 400 });
  const params = new URLSearchParams();
  params.set("line_items[0][price_data][currency]", String(booking.currency || "EUR").toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(amount * 100)));
  params.set("line_items[0][price_data][product_data][name]", "OperiX Booking " + booking.booking_number);
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[company_id]", workspace.companyId);
  params.set("metadata[booking_id]", booking.id);
  params.set("metadata[booking_number]", booking.booking_number);
  params.set("after_completion[type]", "hosted_confirmation");
  const response = await fetch("https://api.stripe.com/v1/payment_links", { method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const stripe = await response.json() as { url?: string; id?: string; error?: { message?: string } };
  if (!response.ok || !stripe.url) return NextResponse.json({ error: stripe.error?.message || "Stripe could not create the payment link." }, { status: 502 });
  return NextResponse.json({ url: stripe.url, id: stripe.id, amount, currency: booking.currency || "EUR" });
}
