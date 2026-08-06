import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "../lib/logger";
import { sendDelivery } from "./smtp";

type Delivery = { id: string; company_id: string; mailbox_id: string | null; message_id: string | null; ticket_id: string | null; recipient: string; subject: string | null; delivery_type: string; payload: Record<string, unknown>; attempts: number };
function dbRows<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
export function calculateRetryAt(attempt: number, now = Date.now()): string { const seconds = Math.min(6 * 60 * 60, 30 * 2 ** Math.max(0, attempt - 1)); return new Date(now + seconds * 1000).toISOString(); }
function backoff(attempt: number): string { return calculateRetryAt(attempt); }

export async function processEmailQueue(client: SupabaseClient, limit = 20): Promise<number> {
  const due = await client.from("support_email_deliveries").select("id,company_id,mailbox_id,message_id,ticket_id,recipient,subject,delivery_type,payload,attempts").in("status", ["queued", "retrying"]).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  if (due.error) { logEvent("smtp_queue_read_failed", { error: due.error.message }); return 0; }
  let processed = 0;
  for (const candidate of dbRows<Delivery>(due.data)) {
    const claimed = await client.from("support_email_deliveries").update({ status: "sending", attempts: candidate.attempts + 1, updated_at: new Date().toISOString() }).eq("id", candidate.id).in("status", ["queued", "retrying"]).select("id,company_id,mailbox_id,message_id,ticket_id,recipient,subject,delivery_type,payload,attempts").maybeSingle();
    if (claimed.error || !claimed.data) continue;
    const delivery = claimed.data as Delivery;
    try {
      const sent = await sendDelivery(client, delivery);
      const update = await client.from("support_email_deliveries").update({ status: "sent", provider_message_id: sent.providerMessageId ?? null, sent_at: new Date().toISOString(), next_attempt_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", delivery.id);
      if (update.error) throw new Error(update.error.message);
      if (delivery.delivery_type === "acknowledgement" && delivery.ticket_id) await client.from("support_tickets").update({ acknowledgement_sent_at: new Date().toISOString(), acknowledgement_delivery_id: delivery.id }).eq("company_id", delivery.company_id).eq("id", delivery.ticket_id).is("acknowledgement_sent_at", null);
      if (delivery.ticket_id) await client.from("support_events").insert({ company_id: delivery.company_id, ticket_id: delivery.ticket_id, event_name: "email_sent", payload: { delivery_id: delivery.id, delivery_type: delivery.delivery_type, recipient: delivery.recipient, provider_message_id: sent.providerMessageId ?? null } });
      logEvent("email_sent", { deliveryId: delivery.id, ticketId: delivery.ticket_id, providerMessageId: sent.providerMessageId });
      processed += 1;
    } catch (error) {
      const terminal = delivery.attempts >= 8;
      const reason = error instanceof Error ? error.message : String(error);
      const nextStatus = terminal ? "failed" : "retrying";
      const nextAttemptAt = terminal ? new Date().toISOString() : backoff(delivery.attempts);
      await client.from("support_email_deliveries").update({ status: nextStatus, next_attempt_at: nextAttemptAt, last_error: reason, updated_at: new Date().toISOString() }).eq("id", delivery.id);
      if (delivery.ticket_id) {
        await client.from("support_events").insert({ company_id: delivery.company_id, ticket_id: delivery.ticket_id, event_name: terminal ? "email_delivery_failed" : "email_retrying", payload: { delivery_id: delivery.id, attempt: delivery.attempts, terminal, error: reason, next_attempt_at: terminal ? null : nextAttemptAt } });
      }
      logEvent("email_send_failed", { deliveryId: delivery.id, ticketId: delivery.ticket_id, attempt: delivery.attempts, terminal, error: reason });
    }
  }
  return processed;
}

export async function processMaintenance(client: SupabaseClient): Promise<void> {
  const result = await client.from("support_job_queue").delete().eq("status", "completed").lt("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  if (result.error) logEvent("worker_cleanup_failed", { error: result.error.message });
}
