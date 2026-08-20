import { NextResponse } from "next/server";
import { saveInvoiceDocument } from "@invoice-monorepo/api/repositories";
import { resolveWorkspace } from "@invoice-monorepo/api/workspace";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Invoice integration is not configured." }, { status: 503 });
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { bookingId?: string };
  if (!body.bookingId) return NextResponse.json({ error: "A booking is required." }, { status: 400 });
  const workspace = await resolveWorkspace(client, authData.user.id);
  const [invoicePermission, salesInvoicePermission] = await Promise.all([
    client.rpc("booking_has_permission", { p_company_id: workspace.companyId, p_permission: "invoice.create" }),
    client.rpc("booking_has_permission", { p_company_id: workspace.companyId, p_permission: "sales_invoice.create" }),
  ]);
  if ((invoicePermission.error && salesInvoicePermission.error) || (!invoicePermission.data && !salesInvoicePermission.data)) {
    return NextResponse.json({ error: "You do not have permission to create invoices." }, { status: 403 });
  }
  const { data: booking, error } = await client.from("bookings").select("id,company_id,customer_id,booking_number,starts_at,total_amount,currency,service:booking_services(name)").eq("company_id", workspace.companyId).eq("id", body.bookingId).single();
  if (error || !booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const service = Array.isArray(booking.service) ? booking.service[0] : booking.service;
  try {
    const saved = await saveInvoiceDocument(client, {
      draft: {
        userId: authData.user.id,
        companyId: workspace.companyId,
        clientId: booking.customer_id || null,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        documentType: "INVOICE",
        status: "draft",
        commercialStatus: "DRAFT",
        paymentMethod: "bank",
        currency: booking.currency || "EUR",
        sourceDocumentType: "BOOKING",
        sourceDocumentId: booking.id,
        notes: "Created from OperiX Booking " + booking.booking_number,
        lines: [{
          productId: null,
          description: String(service?.name || "Booking service"),
          quantity: 1,
          unitPrice: Number(booking.total_amount || 0),
          taxRate: 0,
          taxIncluded: false,
          unit: "booking",
        }],
      },
      postInvoice: false,
      idempotencyKey: "booking-" + booking.id,
    });
    return NextResponse.json({ invoiceId: saved.invoice.id, invoiceNumber: String(saved.invoice.invoice_number), total: saved.totals.total });
  } catch (saveError) {
    return NextResponse.json({ error: saveError instanceof Error ? saveError.message : "The invoice could not be created." }, { status: 422 });
  }
}
