import { createTransport } from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmailTransport, type NotificationRequest } from "@invoice-monorepo/notifications";
import { decryptSecret } from "../lib/secrets";
import { supportStorageBucket } from "../lib/supabase/config";

type Delivery = { id: string; company_id: string; mailbox_id: string | null; message_id: string | null; ticket_id: string | null; recipient: string; subject: string | null; delivery_type: string; payload: Record<string, unknown>; attempts: number };
type Mailbox = { id: string; company_id: string; address: string; display_name: string; reply_to: string | null; smtp_host: string | null; smtp_port: number; smtp_username: string | null; smtp_password_ciphertext: string | null; smtp_tls_mode: string; default_signature: string | null };
type Ticket = { id: string; ticket_number: string; subject: string; contact_id: string | null };
type Message = { id: string; conversation_id: string; body_text: string | null; body_html: string | null; subject: string | null };

function dbRows<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function htmlFromText(value: string): string { return `<p>${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p>`; }

async function loadMessageContext(client: SupabaseClient, delivery: Delivery): Promise<{ mailbox: Mailbox; ticket: Ticket; message: Message | null; references: string[] }> {
  if (!delivery.mailbox_id || !delivery.ticket_id) throw new Error("Email delivery is missing mailbox or ticket");
  const [mailboxResult, ticketResult] = await Promise.all([
    client.from("support_mailboxes").select("id,company_id,address,display_name,reply_to,smtp_host,smtp_port,smtp_username,smtp_password_ciphertext,smtp_tls_mode,default_signature").eq("id", delivery.mailbox_id).eq("company_id", delivery.company_id).maybeSingle(),
    client.from("support_tickets").select("id,ticket_number,subject,contact_id").eq("id", delivery.ticket_id).eq("company_id", delivery.company_id).maybeSingle(),
  ]);
  if (mailboxResult.error || ticketResult.error || !mailboxResult.data || !ticketResult.data) throw new Error(mailboxResult.error?.message ?? ticketResult.error?.message ?? "Mailbox or ticket not found");
  const message = delivery.message_id ? await client.from("support_messages").select("id,conversation_id,body_text,body_html,subject").eq("id", delivery.message_id).eq("company_id", delivery.company_id).maybeSingle() : { data: null, error: null };
  if (message.error) throw new Error(message.error.message);
  const references: string[] = [];
  if (message.data) {
    const threadMessages = await client.from("support_messages").select("external_message_id").eq("company_id", delivery.company_id).eq("conversation_id", message.data.conversation_id).not("external_message_id", "is", null).order("created_at", { ascending: false }).limit(20);
    for (const row of dbRows<{ external_message_id: string }>(threadMessages.data)) if (row.external_message_id) references.push(`<${row.external_message_id.replace(/^<|>$/g, "")}>`);
  }
  return { mailbox: mailboxResult.data as Mailbox, ticket: ticketResult.data as Ticket, message: message.data as Message | null, references: [...new Set(references)] };
}

export async function sendDelivery(client: SupabaseClient, delivery: Delivery): Promise<{ providerMessageId?: string }> {
  const context = await loadMessageContext(client, delivery);
  const { mailbox, ticket, message, references } = context;
  if (!mailbox.smtp_host || !mailbox.smtp_username || !mailbox.smtp_password_ciphertext) throw new Error("SMTP is not configured for this mailbox");
  const password = decryptSecret(mailbox.smtp_password_ciphertext);
  const transporter = createTransport({ host: mailbox.smtp_host, port: mailbox.smtp_port, secure: mailbox.smtp_tls_mode === "implicit", requireTLS: mailbox.smtp_tls_mode === "starttls", auth: { user: mailbox.smtp_username, pass: password } });
  const notification = createEmailTransport(async (request: NotificationRequest) => {
    const info = await transporter.sendMail({
      from: { name: mailbox.display_name, address: mailbox.address },
      to: request.to,
      replyTo: request.replyTo,
      subject: request.subject,
      text: request.text,
      html: request.html,
      headers: request.headers,
      attachments: request.attachments?.map((attachment) => ({ filename: attachment.filename, content: Buffer.from(attachment.content), contentType: attachment.contentType, cid: attachment.contentId })),
    });
    return { providerMessageId: info.messageId };
  });
  try {
    let text: string;
    let html: string;
    let subject: string;
    const headers: Record<string, string> = { "X-OperiX-Support-Ticket": ticket.ticket_number };
    if (delivery.delivery_type === "acknowledgement") {
      const contactName = String(delivery.payload.contact_name ?? "there");
      text = `Hello ${contactName},\n\nThank you for contacting us.\n\nYour request has been received.\n\nTicket Number: ${ticket.ticket_number}\n\nOur support team will reply shortly.\n\nRegards,\nOperiX Support`;
      html = htmlFromText(text);
      subject = delivery.subject ?? `Ticket ${ticket.ticket_number} received`;
    } else {
      text = message?.body_text ?? "";
      if (mailbox.default_signature && !text.includes(mailbox.default_signature)) text = `${text}\n\n${mailbox.default_signature}`;
      html = message?.body_html ?? htmlFromText(text);
      subject = delivery.subject ?? `Re: ${ticket.ticket_number} ${ticket.subject}`;
      if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;
      if (references.length) { headers.References = references.join(" "); headers["In-Reply-To"] = references[references.length - 1]; }
    }
    const attachmentRows = message ? await client.from("support_attachments").select("filename,content_type,storage_path").eq("company_id", delivery.company_id).eq("message_id", message.id).eq("virus_scan_status", "clean") : { data: [], error: null };
    if (attachmentRows.error) throw new Error(attachmentRows.error.message);
    const attachments = [];
    for (const attachment of dbRows<{ filename: string; content_type: string; storage_path: string }>(attachmentRows.data)) {
      const downloaded = await client.storage.from(supportStorageBucket).download(attachment.storage_path);
      if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message ?? `Unable to download ${attachment.filename}`);
      attachments.push({ filename: attachment.filename, contentType: attachment.content_type, content: new Uint8Array(await downloaded.data.arrayBuffer()) });
    }
    const result = await notification.send({ channel: "email", tenantId: delivery.company_id, to: [delivery.recipient], subject, text, html, replyTo: mailbox.reply_to || mailbox.address, headers, attachments });
    if (message && result.providerMessageId) await client.from("support_messages").update({ external_message_id: result.providerMessageId.replace(/^<|>$/g, "") }).eq("id", message.id).eq("company_id", delivery.company_id);
    return { providerMessageId: result.providerMessageId };
  } finally { transporter.close(); }
}
