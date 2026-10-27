import { saveCustomer, saveInvoiceDocument, transitionInvoiceStatus } from "@invoice-monorepo/api/repositories";
import { runtimeConfig, tenantClient } from "@invoice-monorepo/public-api/server";
import { idempotencyUuid } from "@invoice-monorepo/public-api/security";
import { createAdminClient } from "@/lib/supabase/admin";

type Job = { job_id: string; company_id: string; booking_id: string; trigger_event: string; attempts: number };

function one<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] : value; }

async function failJob(admin: ReturnType<typeof createAdminClient>, job: Job, error: unknown) {
  if (!admin) return;
  const message = (error instanceof Error ? error.message : "Booking invoice automation failed.").slice(0, 1000);
  const delay = Math.min(24 * 60 * 60 * 1000, 1_000 * 2 ** Math.min(job.attempts, 10));
  await admin.from("booking_invoice_jobs").update({ status: "failed", last_error: message, available_at: new Date(Date.now() + delay).toISOString(), locked_at: null, updated_at: new Date().toISOString() }).eq("id", job.job_id);
  return message;
}

export async function processBookingInvoiceJobs(limit = 25) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Invoice automation storage is not configured.");
  const claimed = await admin.rpc("booking_invoice_claim_jobs", { p_limit: limit });
  if (claimed.error) throw claimed.error;
  const jobs = (Array.isArray(claimed.data) ? claimed.data : claimed.data ? [claimed.data] : []) as Job[];
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const link = await admin.from("booking_invoice_links").select("invoice_id").eq("company_id", job.company_id).eq("booking_id", job.booking_id).maybeSingle();
      if (link.error) throw link.error;
      if (link.data?.invoice_id) {
        await admin.from("booking_invoice_jobs").update({ status: "completed", locked_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", job.job_id);
        completed += 1;
        continue;
      }

      const settingsResult = await admin.from("booking_invoice_automation_settings").select("enabled,invoice_mode,trigger_event").eq("company_id", job.company_id).maybeSingle();
      if (settingsResult.error) throw settingsResult.error;
      if (!settingsResult.data?.enabled || settingsResult.data.trigger_event !== job.trigger_event) {
        await admin.from("booking_invoice_jobs").update({ status: "canceled", locked_at: null, last_error: "Automation setting no longer matches this event.", updated_at: new Date().toISOString() }).eq("id", job.job_id);
        completed += 1;
        continue;
      }

      const bookingResult = await admin.from("bookings").select("id,company_id,customer_id,booking_number,starts_at,total_amount,discount_amount,quantity,participant_count,currency,notes,guest_name,guest_email,guest_phone,created_by,service:booking_services(id,name,price,tax_rate,currency)").eq("company_id", job.company_id).eq("id", job.booking_id).single();
      if (bookingResult.error || !bookingResult.data) throw bookingResult.error || new Error("Booking not found.");
      const booking = bookingResult.data as Record<string, unknown>;
      const service = one(booking.service) as Record<string, unknown> | undefined;
      const ownerResult = await admin.from("companies").select("owner_id").eq("id", job.company_id).single();
      if (ownerResult.error || !ownerResult.data?.owner_id) throw ownerResult.error || new Error("The workspace owner could not be resolved.");
      // The automation is configured by a workspace administrator and crosses
      // the Booking/Invoice product boundary. Use the workspace owner as the
      // canonical actor so a booking creator with Booking-only permissions
      // cannot cause an Invoice write to fail or inherit the wrong scope.
      const actorId = String(ownerResult.data.owner_id);
      const tenant = tenantClient(runtimeConfig("live"), actorId);
      let clientId = booking.customer_id ? String(booking.customer_id) : null;
      if (!clientId && booking.guest_name) {
        const guest = await saveCustomer(tenant, { company_id: job.company_id, user_id: actorId, name: String(booking.guest_name), email: booking.guest_email ? String(booking.guest_email) : null, phone: booking.guest_phone ? String(booking.guest_phone) : null, external_reference: `BOOKING-CUSTOMER-${job.booking_id}` });
        clientId = String(guest.id);
      }
      const quantity = Number(booking.quantity || booking.participant_count || 1);
      const saved = await saveInvoiceDocument(tenant, {
        draft: {
          userId: actorId,
          companyId: job.company_id,
          clientId,
          issueDate: new Date().toISOString().slice(0, 10),
          dueDate: new Date().toISOString().slice(0, 10),
          documentType: "INVOICE",
          status: "draft",
          commercialStatus: "DRAFT",
          paymentMethod: "bank",
          currency: String(booking.currency || service?.currency || "EUR"),
          sourceDocumentType: "BOOKING",
          sourceDocumentId: job.booking_id,
          documentDiscountAmount: booking.discount_amount ? Number(booking.discount_amount) : undefined,
          notes: `Created from OperiX Booking ${String(booking.booking_number || job.booking_id)}`,
          lines: [{ productId: null, description: String(service?.name || "Booking service"), quantity, unitPrice: Number(service?.price ?? booking.total_amount ?? 0), taxRate: Number(service?.tax_rate || 0), taxIncluded: false, unit: "booking" }],
        },
        postInvoice: false,
        idempotencyKey: idempotencyUuid(`booking-invoice:${job.company_id}:${job.booking_id}`),
      });
      const invoiceId = String(saved.invoice.id);
      const reference = `BOOKING-${String(booking.booking_number || job.booking_id)}`;
      await admin.from("invoices").update({ external_reference: reference }).eq("id", invoiceId).eq("company_id", job.company_id);
      const linkInsert = await admin.from("booking_invoice_links").insert({ company_id: job.company_id, booking_id: job.booking_id, invoice_id: invoiceId, trigger_event: job.trigger_event, idempotency_key: idempotencyUuid(`booking-invoice:${job.company_id}:${job.booking_id}`) });
      if (linkInsert.error && linkInsert.error.code !== "23505") throw linkInsert.error;
      if (settingsResult.data.invoice_mode === "finalize") {
        const transition = await transitionInvoiceStatus(tenant, invoiceId, "ISSUED", "booking.automation.finalize");
        if (transition.error) throw transition.error;
      }
      await admin.from("booking_invoice_jobs").update({ status: "completed", locked_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", job.job_id);
      completed += 1;
    } catch (error) {
      await failJob(admin, job, error);
      failed += 1;
      console.error("Booking invoice automation job failed", { jobId: job.job_id, bookingId: job.booking_id, message: error instanceof Error ? error.message : "unknown error" });
    }
  }
  return { claimed: jobs.length, completed, failed };
}
