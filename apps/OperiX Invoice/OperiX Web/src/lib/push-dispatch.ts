/** Pure helpers for turning queued notification events into Expo push messages (no network, easy to test). */

export interface PushOutboxEvent {
  id: string;
  company_id: string;
  event_type: string;
  category: string;
  title: { en?: string; sq?: string } | null;
  body: { en?: string; sq?: string } | null;
  data: Record<string, unknown> | null;
}

export interface PushDeviceToken {
  user_id: string;
  expo_push_token: string;
  language?: string | null;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
  channelId: "default";
  priority: "high";
}

const EXPO_TOKEN = /^(Exponent|Expo)PushToken\[[^\]]+\]$/;

/** One message per device. The text uses the language the device registered with (Albanian or English). */
export function buildMessages(event: PushOutboxEvent, tokens: PushDeviceToken[], recipientIds: Iterable<string>): ExpoPushMessage[] {
  const recipients = new Set(recipientIds);
  const seen = new Set<string>();
  const messages: ExpoPushMessage[] = [];
  for (const token of tokens) {
    if (!recipients.has(token.user_id) || !EXPO_TOKEN.test(token.expo_push_token)) continue;
    const key = `${token.user_id}:${token.expo_push_token}`;
    if (seen.has(key)) continue; // the same phone is registered once per company
    seen.add(key);
    const lang = token.language === "sq" ? "sq" : "en";
    messages.push({
      to: token.expo_push_token,
      title: String(event.title?.[lang] || event.title?.en || "OperiX"),
      body: String(event.body?.[lang] || event.body?.en || ""),
      data: { ...(event.data || {}), eventType: event.event_type, companyId: event.company_id },
      sound: "default",
      channelId: "default",
      priority: "high",
    });
  }
  return messages;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

interface ExpoTicket { status?: string; message?: string; details?: { error?: string } }

/** Reads Expo's answer for a batch: which devices are gone for good (to switch off) and how many were accepted. */
export function readTickets(messages: ExpoPushMessage[], response: { data?: ExpoTicket[] } | null): { accepted: number; invalidTokens: string[]; errors: string[] } {
  const tickets = response?.data || [];
  const invalidTokens: string[] = [];
  const errors: string[] = [];
  let accepted = 0;
  messages.forEach((message, index) => {
    const ticket = tickets[index];
    if (ticket?.status === "ok") { accepted += 1; return; }
    if (ticket?.details?.error === "DeviceNotRegistered") invalidTokens.push(message.to);
    else errors.push(ticket?.message || ticket?.details?.error || "No answer from Expo");
  });
  return { accepted, invalidTokens, errors };
}
