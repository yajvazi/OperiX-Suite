export const NOTIFICATION_CHANNELS = [
  "email",
  "push",
  "sms",
  "whatsapp",
  "telegram",
  "discord",
  "slack",
  "microsoft-teams",
  "in_app",
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
  contentId?: string;
};

export type NotificationRequest = {
  channel: NotificationChannel;
  tenantId: string;
  to: string[];
  subject?: string;
  text?: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: NotificationAttachment[];
  metadata?: Record<string, unknown>;
};

export type NotificationDelivery = {
  channel: NotificationChannel;
  providerMessageId?: string;
  acceptedAt: string;
};

export interface NotificationTransport {
  readonly channel: NotificationChannel;
  send(request: NotificationRequest): Promise<NotificationDelivery>;
}

export class NotificationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NotificationError";
    this.code = code;
  }
}

const HEADER_INJECTION = /[\r\n]/;

export function assertSafeHeader(value: string, fieldName: string): string {
  if (HEADER_INJECTION.test(value)) {
    throw new NotificationError("header_injection", `${fieldName} contains an invalid line break`);
  }
  return value;
}

export function normalizeRecipients(recipients: string[]): string[] {
  const normalized = [...new Set(recipients.map((recipient) => recipient.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) {
    throw new NotificationError("missing_recipient", "At least one recipient is required");
  }
  normalized.forEach((recipient) => assertSafeHeader(recipient, "recipient"));
  return normalized;
}

export type EmailSender = (request: NotificationRequest) => Promise<{ providerMessageId?: string }>;

export function createEmailTransport(sender: EmailSender): NotificationTransport {
  return {
    channel: "email",
    async send(request) {
      if (request.channel !== "email") {
        throw new NotificationError("invalid_channel", "The email transport only accepts email requests");
      }
      const to = normalizeRecipients(request.to);
      const subject = request.subject ? assertSafeHeader(request.subject, "subject") : undefined;
      const replyTo = request.replyTo ? assertSafeHeader(request.replyTo, "replyTo") : undefined;
      const headers = Object.fromEntries(
        Object.entries(request.headers ?? {}).map(([key, value]) => [assertSafeHeader(key, "header name"), assertSafeHeader(value, key)]),
      );
      const result = await sender({ ...request, to, subject, replyTo, headers });
      return {
        channel: "email",
        providerMessageId: result.providerMessageId,
        acceptedAt: new Date().toISOString(),
      };
    },
  };
}

export type NotificationSink = (request: NotificationRequest) => Promise<{ providerMessageId?: string }>;

/** Adapter for shared application-level notification sinks (in-app, push, or a future provider). */
export function createNotificationSinkTransport(channel: NotificationChannel, sink: NotificationSink): NotificationTransport {
  return {
    channel,
    async send(request) {
      if (request.channel !== channel) throw new NotificationError("invalid_channel", `The ${channel} transport received a ${request.channel} request`);
      const result = await sink(request);
      return { channel, providerMessageId: result.providerMessageId, acceptedAt: new Date().toISOString() };
    },
  };
}

export class NotificationDispatcher {
  private readonly transports = new Map<NotificationChannel, NotificationTransport>();

  constructor(transports: NotificationTransport[] = []) {
    transports.forEach((transport) => this.register(transport));
  }

  register(transport: NotificationTransport): void {
    this.transports.set(transport.channel, transport);
  }

  async send(request: NotificationRequest): Promise<NotificationDelivery> {
    const transport = this.transports.get(request.channel);
    if (!transport) {
      throw new NotificationError("transport_unavailable", `No transport is registered for ${request.channel}`);
    }
    return transport.send(request);
  }
}
