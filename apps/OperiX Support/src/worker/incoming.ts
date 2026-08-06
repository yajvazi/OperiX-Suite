import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTicketNumber } from "@invoice-monorepo/support";
import { parseIncomingEmail, type ParsedIncomingEmail } from "../lib/email/parser";
import { supportStorageBucket } from "../lib/supabase/config";
import { logEvent } from "../lib/logger";

type Mailbox = { id: string; company_id: string; department_id: string | null; address: string; display_name: string; ticket_prefix: string; source_application: string; reply_to: string | null; default_signature: string | null };
type Ticket = { id: string; ticket_number: string; subject: string; status: string; contact_id: string | null; mailbox_id: string | null };

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf", "text/plain", "application/zip", "application/x-zip-compressed",
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function safeFilename(value: string): string { return value.replace(/[\\/\0\r\n]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 160) || "attachment"; }
function dbRows<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }

async function findThreadTicket(client: SupabaseClient, mailbox: Mailbox, email: ParsedIncomingEmail): Promise<Ticket | null> {
  const ids = [...new Set([email.messageId, email.inReplyTo, ...email.references].filter((value): value is string => Boolean(value)))];
  if (ids.length) {
    const messages = await client.from("support_messages").select("conversation_id").eq("company_id", mailbox.company_id).in("external_message_id", ids).limit(10);
    const conversationIds = dbRows<{ conversation_id: string }>(messages.data).map((message) => message.conversation_id);
    if (conversationIds.length) {
      const conversations = await client.from("support_conversations").select("ticket_id").eq("company_id", mailbox.company_id).in("id", conversationIds).limit(1);
      const ticketId = dbRows<{ ticket_id: string }>(conversations.data)[0]?.ticket_id;
      if (ticketId) {
        const ticket = await client.from("support_tickets").select("id,ticket_number,subject,status,contact_id,mailbox_id").eq("company_id", mailbox.company_id).eq("id", ticketId).maybeSingle();
        if (ticket.data) return ticket.data as Ticket;
      }
    }
  }
  const ticketNumber = extractTicketNumber(email.subject);
  if (!ticketNumber) return null;
  const result = await client.from("support_tickets").select("id,ticket_number,subject,status,contact_id,mailbox_id").eq("company_id", mailbox.company_id).eq("ticket_number", ticketNumber).is("deleted_at", null).maybeSingle();
  return (result.data as Ticket | null) ?? null;
}

async function ensureContact(client: SupabaseClient, mailbox: Mailbox, email: ParsedIncomingEmail): Promise<string> {
  const existing = await client.from("support_contacts").select("id").eq("company_id", mailbox.company_id).eq("email_normalized", email.from.address).is("deleted_at", null).maybeSingle();
  if (existing.data?.id) return String(existing.data.id);
  const created = await client.from("support_contacts").insert({ company_id: mailbox.company_id, display_name: email.from.name || email.from.address, email: email.from.address, contact_kind: "external_customer", source_application: mailbox.source_application, created_by: null, updated_by: null }).select("id").single();
  if (created.data?.id) return String(created.data.id);
  const raced = await client.from("support_contacts").select("id").eq("company_id", mailbox.company_id).eq("email_normalized", email.from.address).maybeSingle();
  if (!raced.data?.id) throw new Error(`Unable to create contact for ${email.from.address}`);
  return String(raced.data.id);
}

async function getConversation(client: SupabaseClient, mailbox: Mailbox, ticketId: string): Promise<string> {
  const existing = await client.from("support_conversations").select("id").eq("company_id", mailbox.company_id).eq("ticket_id", ticketId).eq("conversation_type", "email").eq("mailbox_id", mailbox.id).order("created_at").limit(1).maybeSingle();
  if (existing.data?.id) return String(existing.data.id);
  const created = await client.from("support_conversations").insert({ company_id: mailbox.company_id, ticket_id: ticketId, conversation_type: "email", mailbox_id: mailbox.id, address: mailbox.address }).select("id").single();
  if (created.error || !created.data?.id) throw new Error(created.error?.message ?? "Unable to create email conversation");
  return String(created.data.id);
}

async function createTicket(client: SupabaseClient, mailbox: Mailbox, email: ParsedIncomingEmail, contactId: string): Promise<Ticket> {
  const created = await client.from("support_tickets").insert({ company_id: mailbox.company_id, subject: email.subject, status: "open", priority: "normal", department_id: mailbox.department_id, contact_id: contactId, mailbox_id: mailbox.id, source_application: mailbox.source_application, last_message_at: email.receivedAt }).select("id,ticket_number,subject,status,contact_id,mailbox_id").single();
  if (created.error || !created.data) throw new Error(created.error?.message ?? "Unable to create ticket from incoming email");
  const ticket = created.data as Ticket;
  const conversationId = await getConversation(client, mailbox, ticket.id);
  const message = await client.from("support_messages").insert({ company_id: mailbox.company_id, conversation_id: conversationId, author_contact_id: contactId, visibility: "public", body_text: email.bodyText, body_html: email.bodyHtml, raw_body: email.rawBody, subject: email.subject, external_message_id: email.messageId, in_reply_to: email.inReplyTo, reference_ids: email.references, source: "customer", email_headers: email.headers, sent_at: email.receivedAt }).select("id").single();
  if (message.error || !message.data) throw new Error(message.error?.message ?? "Unable to create initial email message");
  const event = await client.from("support_events").insert([
    { company_id: mailbox.company_id, ticket_id: ticket.id, event_name: "ticket_created", payload: { ticket_number: ticket.ticket_number, mailbox_id: mailbox.id, source_application: mailbox.source_application, message_id: message.data.id }, actor_contact_id: contactId },
    { company_id: mailbox.company_id, ticket_id: ticket.id, event_name: "email_received", payload: { message_id: message.data.id, message_id_header: email.messageId, conversation_id: conversationId }, actor_contact_id: contactId },
  ]);
  if (event.error) throw new Error(event.error.message);
  return ticket;
}

async function appendToTicket(client: SupabaseClient, mailbox: Mailbox, ticket: Ticket, email: ParsedIncomingEmail, contactId: string): Promise<{ messageId: string; conversationId: string }> {
  const conversationId = await getConversation(client, mailbox, ticket.id);
  const message = await client.from("support_messages").insert({ company_id: mailbox.company_id, conversation_id: conversationId, author_contact_id: contactId, visibility: "public", body_text: email.bodyText, body_html: email.bodyHtml, raw_body: email.rawBody, subject: email.subject, external_message_id: email.messageId, in_reply_to: email.inReplyTo, reference_ids: email.references, source: "customer", email_headers: email.headers, sent_at: email.receivedAt }).select("id").single();
  if (message.error || !message.data) throw new Error(message.error?.message ?? "Unable to append incoming email");
  const reopened = ["resolved", "closed", "archived"].includes(ticket.status);
  const update: Record<string, unknown> = { last_message_at: email.receivedAt, updated_at: new Date().toISOString() };
  if (reopened) { update.status = "open"; update.resolved_at = null; update.closed_at = null; update.archived_at = null; }
  else if (ticket.status === "waiting_on_customer") update.status = "open";
  const ticketUpdate = await client.from("support_tickets").update(update).eq("company_id", mailbox.company_id).eq("id", ticket.id);
  if (ticketUpdate.error) throw new Error(ticketUpdate.error.message);
  const eventRows: Array<{ company_id: string; ticket_id: string; event_name: string; payload: Record<string, unknown>; actor_contact_id: string }> = [{ company_id: mailbox.company_id, ticket_id: ticket.id, event_name: "email_received", payload: { message_id: message.data.id, conversation_id: conversationId, message_id_header: email.messageId }, actor_contact_id: contactId }];
  if (reopened) eventRows.push({ company_id: mailbox.company_id, ticket_id: ticket.id, event_name: "ticket_reopened", payload: { previous_status: ticket.status, reason: "customer_email" }, actor_contact_id: contactId });
  const event = await client.from("support_events").insert(eventRows);
  if (event.error) throw new Error(event.error.message);
  return { messageId: String(message.data.id), conversationId };
}

async function importAttachments(client: SupabaseClient, mailbox: Mailbox, ticketId: string, messageId: string, email: ParsedIncomingEmail): Promise<void> {
  const maxBytes = Number(process.env.SUPPORT_MAX_ATTACHMENT_BYTES ?? 25 * 1024 * 1024);
  for (const attachment of email.attachments) {
    if (attachment.content.length < 1 || attachment.content.length > maxBytes || !ALLOWED_ATTACHMENT_TYPES.has(attachment.contentType)) { logEvent("email_attachment_rejected", { mailboxId: mailbox.id, ticketId, filename: attachment.filename, contentType: attachment.contentType, size: attachment.content.length }); continue; }
    const checksum = createHash("sha256").update(attachment.content).digest("hex");
    const duplicate = await client.from("support_attachments").select("id").eq("company_id", mailbox.company_id).eq("ticket_id", ticketId).eq("checksum_sha256", checksum).maybeSingle();
    if (duplicate.data?.id) continue;
    const id = randomUUID();
    const storagePath = `${mailbox.company_id}/${ticketId}/${id}/${safeFilename(attachment.filename)}`;
    const upload = await client.storage.from(supportStorageBucket).upload(storagePath, attachment.content, { contentType: attachment.contentType, upsert: false });
    if (upload.error) { logEvent("email_attachment_upload_failed", { mailboxId: mailbox.id, ticketId, filename: attachment.filename, error: upload.error.message }); continue; }
    const inserted = await client.from("support_attachments").insert({ id, company_id: mailbox.company_id, ticket_id: ticketId, message_id: messageId, filename: safeFilename(attachment.filename), content_type: attachment.contentType, byte_size: attachment.content.length, storage_path: storagePath, checksum_sha256: checksum, provider_attachment_id: attachment.providerAttachmentId ?? null, virus_scan_status: "pending", created_by: null });
    if (inserted.error) { await client.storage.from(supportStorageBucket).remove([storagePath]); continue; }
    await client.from("support_events").insert({ company_id: mailbox.company_id, ticket_id: ticketId, event_name: "attachment_uploaded", payload: { attachment_id: id, message_id: messageId, filename: attachment.filename, content_type: attachment.contentType, byte_size: attachment.content.length } });
  }
}

async function queueAcknowledgement(client: SupabaseClient, mailbox: Mailbox, ticket: Ticket, contactId: string): Promise<void> {
  const contact = await client.from("support_contacts").select("display_name,email").eq("company_id", mailbox.company_id).eq("id", contactId).maybeSingle();
  const recipient = String(contact.data?.email ?? "").trim().toLowerCase();
  if (!recipient) return;
  const result = await client.from("support_email_deliveries").insert({ company_id: mailbox.company_id, mailbox_id: mailbox.id, ticket_id: ticket.id, recipient, subject: `Ticket ${ticket.ticket_number} received`, delivery_type: "acknowledgement", payload: { contact_name: contact.data?.display_name ?? recipient }, idempotency_key: `ack:${ticket.id}` }).select("id").maybeSingle();
  if (result.error && result.error.code !== "23505") throw new Error(result.error.message);
  const deliveryId = result.data?.id ?? (await client.from("support_email_deliveries").select("id").eq("idempotency_key", `ack:${ticket.id}`).maybeSingle()).data?.id;
  if (deliveryId) await client.from("support_tickets").update({ acknowledgement_delivery_id: deliveryId }).eq("company_id", mailbox.company_id).eq("id", ticket.id).is("acknowledgement_sent_at", null);
}

export async function processIncomingRawEmail(client: SupabaseClient, mailbox: Mailbox, raw: Buffer, providerUid?: number, uidValidity?: number): Promise<"imported" | "duplicate"> {
  const parsed = await parseIncomingEmail(raw);
  const inbox = await client.from("support_email_inbox_messages").insert({ company_id: mailbox.company_id, mailbox_id: mailbox.id, provider_uid: providerUid ?? null, uid_validity: uidValidity ?? null, message_id: parsed.messageId, message_hash: parsed.messageHash, received_at: parsed.receivedAt }).select("id").maybeSingle();
  if (inbox.error) {
    if (inbox.error.code === "23505") {
      const existing = await client.from("support_email_inbox_messages").select("ticket_id").eq("mailbox_id", mailbox.id).eq("message_hash", parsed.messageHash).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data?.ticket_id) return "duplicate";
      // A prior worker may have claimed the unique message row and failed before
      // completing import. Continue so the row can be completed idempotently.
    } else {
      throw new Error(inbox.error.message);
    }
  }
  const contactId = await ensureContact(client, mailbox, parsed);
  let ticket = await findThreadTicket(client, mailbox, parsed);
  let messageId: string;
  if (!ticket) { ticket = await createTicket(client, mailbox, parsed, contactId); const conversation = await client.from("support_conversations").select("id").eq("company_id", mailbox.company_id).eq("ticket_id", ticket.id).order("created_at").limit(1).maybeSingle(); const message = conversation.data?.id ? await client.from("support_messages").select("id").eq("company_id", mailbox.company_id).eq("conversation_id", conversation.data.id).order("created_at").limit(1).maybeSingle() : null; messageId = String(message?.data?.id ?? ""); await queueAcknowledgement(client, mailbox, ticket, contactId); }
  else { const appended = await appendToTicket(client, mailbox, ticket, parsed, contactId); messageId = appended.messageId; }
  if (messageId) await importAttachments(client, mailbox, ticket.id, messageId, parsed);
  await client.from("support_email_inbox_messages").update({ ticket_id: ticket.id }).eq("company_id", mailbox.company_id).eq("mailbox_id", mailbox.id).eq("message_hash", parsed.messageHash);
  logEvent("email_imported", { mailboxId: mailbox.id, ticketId: ticket.id, ticketNumber: ticket.ticket_number, messageId: parsed.messageId, providerUid });
  return "imported";
}
