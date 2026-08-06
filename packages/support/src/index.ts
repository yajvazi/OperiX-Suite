export const TICKET_STATUSES = [
  "open",
  "waiting_on_customer",
  "waiting_on_agent",
  "in_progress",
  "resolved",
  "closed",
  "archived",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent", "critical"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const MESSAGE_VISIBILITIES = ["public", "internal", "system"] as const;
export type MessageVisibility = (typeof MESSAGE_VISIBILITIES)[number];

export const CONVERSATION_TYPES = ["email", "live_chat", "whatsapp", "telegram", "facebook_messenger", "api", "voice", "sms"] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export type SupportEventName =
  | "ticket_created"
  | "assignment_changed"
  | "status_changed"
  | "priority_changed"
  | "department_changed"
  | "category_changed"
  | "reply_created"
  | "note_created"
  | "attachment_uploaded"
  | "tag_changed"
  | "contact_changed"
  | "ticket_closed"
  | "ticket_reopened"
  | "email_received"
  | "email_queued"
  | "email_sent"
  | "email_retrying"
  | "email_delivery_failed"
  | "email_bounced"
  | "system";

export type SupportEvent = {
  name: SupportEventName;
  payload: Record<string, unknown>;
};

export function normalizePrefix(prefix: string): string {
  const normalized = prefix.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(normalized)) {
    throw new Error("Ticket prefix must contain 2–12 letters or numbers");
  }
  return normalized;
}

export function formatTicketNumber(prefix: string, date: Date, sequence: number): string {
  const normalizedPrefix = normalizePrefix(prefix);
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new Error("Ticket sequence must be between 1 and 999999");
  }
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${normalizedPrefix}-${year}${month}${day}-${sequence.toString().padStart(6, "0")}`;
}

export function extractTicketNumber(subject: string): string | null {
  const match = subject.match(/\b[A-Z0-9]{2,12}-\d{8}-\d{6}\b/i);
  return match?.[0].toUpperCase() ?? null;
}

export function normalizeMessageId(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^<|>$/g, "").toLowerCase();
  return normalized ? normalized : null;
}

export function collapseQuotedHistory(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line) || /^\s*On .+wrote:\s*$/i.test(line) || /^\s*-{2,}\s*original message\s*-{2,}/i.test(line)) break;
    output.push(line);
  }
  return output.join("\n").trim();
}

export function cleanSignature(body: string): string {
  return body
    .split(/\n(?:--|_{3,})\s*\n/)[0]
    .replace(/\nSent from my (?:iPhone|Android|mobile device)\.?\s*$/i, "")
    .trim();
}

export function parseEmailBody(body: string): string {
  return cleanSignature(collapseQuotedHistory(body));
}
