import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { readCrmFlags } from "@/lib/crm/flags";
import { createTwentyClient, twentyLinkFieldName } from "@/lib/crm/twenty-client";
import { linkTwentyCompanyToInvoiceCustomer } from "@/lib/crm/customer-linking";
import { safeCorrelationId, sanitizedCompanyPayload, verifyTwentyWebhookSignature, webhookIdempotencyKey } from "@/lib/crm/security";
import type { TwentyCompanyPayload } from "@/lib/crm/types";

export const runtime = "nodejs";

const envelopeSchema = z.object({
  event: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.string().min(1),
  organizationId: z.string().optional(),
}).passthrough();

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureValid = verifyTwentyWebhookSignature({
    rawBody,
    signature: request.headers.get("x-twenty-webhook-signature"),
    timestamp: request.headers.get("x-twenty-webhook-timestamp"),
    secret: process.env.OPERIX_TWENTY_WEBHOOK_SECRET,
  });
  if (!signatureValid) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });

  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  const parsed = envelopeSchema.safeParse(jsonBody);
  if (!parsed.success) return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Integration storage is not configured." }, { status: 503 });

  const payload = parsed.data;
  const data = payload.data;
  const organizationId = uuidOrUndefined(payload.organizationId || data.operixOrganizationId);
  const sourceEntityType = payload.event.split(".", 1)[0] || "unknown";
  const sourceEntityId = typeof data.id === "string" ? data.id : null;
  const idempotencyKey = webhookIdempotencyKey(rawBody);
  const correlationId = safeCorrelationId(request.headers.get("x-request-id"));
  const flags = readCrmFlags();
  const isPaused = !flags.enabled || !flags.webhooksEnabled;
  const initialStatus = isPaused ? "paused" : organizationId ? "received" : "rejected";

  const { data: eventRow, error: eventError } = await admin
    .from("integration_events")
    .insert({
      organization_id: organizationId || null,
      event_type: payload.event,
      source_system: "twenty",
      source_entity_type: sourceEntityType,
      source_entity_id: sourceEntityId,
      payload: sanitizedCompanyPayload(data),
      idempotency_key: idempotencyKey,
      status: initialStatus,
      attempt_count: 0,
    })
    .select("id")
    .single();
  if (eventError?.code === "23505") return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
  if (eventError || !eventRow) return NextResponse.json({ error: "Webhook event could not be recorded." }, { status: 503 });

  await writeAudit(admin, {
    organizationId,
    eventId: String(eventRow.id),
    action: "twenty.webhook.received",
    outcome: initialStatus === "received" ? "started" : "skipped",
    correlationId,
    details: { eventType: payload.event, sourceEntityType, sourceEntityId, status: initialStatus },
  });

  if (isPaused) return NextResponse.json({ accepted: true, paused: true, eventId: eventRow.id }, { status: 202 });
  if (!organizationId) return NextResponse.json({ error: "A valid organizationId is required." }, { status: 422 });
  if (!sourceEntityId || sourceEntityType !== "company") {
    await markEvent(admin, String(eventRow.id), "skipped", 0);
    return NextResponse.json({ accepted: true, skipped: true, eventId: eventRow.id }, { status: 202 });
  }

  await markEvent(admin, String(eventRow.id), "processing", 1);
  let result;
  try {
    result = await linkTwentyCompanyToInvoiceCustomer({
      db: admin,
      organizationId,
      company: data as TwentyCompanyPayload,
      allowCreate: flags.syncCustomers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer link processing failed.";
    await markEvent(admin, String(eventRow.id), "failed", 1, message);
    await writeAudit(admin, { organizationId, eventId: String(eventRow.id), action: "twenty.company.customer_link", outcome: "failed", correlationId, details: { sourceEntityId } });
    return NextResponse.json({ accepted: true, eventId: eventRow.id, error: "Customer linking failed; event retained for retry." }, { status: 202 });
  }

  if (result.status === "linked" && result.targetEntityId) {
    const twenty = createTwentyClient();
    if (twenty) {
      try {
        await twenty.updateCompany(sourceEntityId, { [twentyLinkFieldName()]: result.targetEntityId });
      } catch (error) {
        await markEvent(admin, String(eventRow.id), "failed", 1, error instanceof Error ? error.message : "Twenty link writeback failed.");
        await writeAudit(admin, { organizationId, eventId: String(eventRow.id), action: "twenty.company.link.writeback", outcome: "failed", correlationId, details: { sourceEntityId } });
        return NextResponse.json({ accepted: true, eventId: eventRow.id, sync: result, writeback: "failed" }, { status: 202 });
      }
    }
  }

  await markEvent(admin, String(eventRow.id), result.status === "failed" ? "failed" : result.status === "skipped" ? "skipped" : "processed", 1, result.error);
  await writeAudit(admin, { organizationId, eventId: String(eventRow.id), action: "twenty.company.customer_link", outcome: result.status === "linked" ? "succeeded" : result.status === "failed" ? "failed" : "skipped", correlationId, details: { sourceEntityId, targetEntityId: result.targetEntityId } });
  return NextResponse.json({ accepted: true, eventId: eventRow.id, sync: result }, { status: 200 });
}

async function markEvent(admin: ReturnType<typeof createAdminClient> & object, id: string, status: string, attemptCount: number, error?: string) {
  await admin.from("integration_events").update({ status, attempt_count: attemptCount, last_error: error || null, processed_at: ["processed", "skipped", "failed"].includes(status) ? new Date().toISOString() : null }).eq("id", id);
}

async function writeAudit(admin: ReturnType<typeof createAdminClient> & object, input: { organizationId?: string; eventId: string; action: string; outcome: string; correlationId: string; details: Record<string, unknown> }) {
  await admin.from("integration_audit_logs").insert({ organization_id: input.organizationId || null, event_id: input.eventId, action: input.action, outcome: input.outcome, correlation_id: input.correlationId, details: input.details });
}

function uuidOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}
