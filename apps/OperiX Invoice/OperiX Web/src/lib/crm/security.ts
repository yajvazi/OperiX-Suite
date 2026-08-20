import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const MAX_WEBHOOK_AGE_SECONDS = 300;

export function webhookIdempotencyKey(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export function verifyTwentyWebhookSignature({
  rawBody,
  signature,
  timestamp,
  secret,
  now = Date.now(),
}: {
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  secret: string | undefined;
  now?: number;
}): boolean {
  if (!secret || !signature || !timestamp) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_WEBHOOK_AGE_SECONDS * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`, "utf8").digest("hex");
  const received = signature.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

export function safeCorrelationId(value: string | null | undefined): string {
  const candidate = value?.trim() || randomUUID();
  return candidate.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 128) || randomUUID();
}

export function verifyInternalApiKey(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided.trim(), "utf8");
  const right = Buffer.from(expected.trim(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sanitizedCompanyPayload(data: Record<string, unknown>): Record<string, unknown> {
  const allowed = [
    "id", "name", "companyName", "domainName", "email", "phone", "website",
    "address", "city", "country", "taxId", "operixOrganizationId", "operixInvoiceCustomerId",
  ];
  return Object.fromEntries(allowed.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
}
