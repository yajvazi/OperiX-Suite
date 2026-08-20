import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeCorrelationId, verifyInternalApiKey, verifyTwentyWebhookSignature, webhookIdempotencyKey } from "./security";

describe("Twenty webhook security", () => {
  const rawBody = JSON.stringify({ event: "company.updated", data: { id: "company-1" }, timestamp: "1700000000" });
  const timestamp = "1700000000";
  const secret = "test-secret";
  const signature = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
  const now = Number(timestamp) * 1000;

  it("verifies a valid bounded signature", () => {
    expect(verifyTwentyWebhookSignature({ rawBody, signature, timestamp, secret, now })).toBe(true);
  });

  it("rejects a changed body, bad secret, and replayed timestamp", () => {
    expect(verifyTwentyWebhookSignature({ rawBody: `${rawBody} `, signature, timestamp, secret, now })).toBe(false);
    expect(verifyTwentyWebhookSignature({ rawBody, signature, timestamp, secret: "wrong", now })).toBe(false);
    expect(verifyTwentyWebhookSignature({ rawBody, signature, timestamp, secret, now: now + 301_000 })).toBe(false);
  });

  it("derives the same idempotency key for duplicate deliveries", () => {
    expect(webhookIdempotencyKey(rawBody)).toBe(webhookIdempotencyKey(rawBody));
  });
});

describe("internal CRM security", () => {
  it("compares internal keys without accepting a missing or different key", () => {
    expect(verifyInternalApiKey("internal-key", "internal-key")).toBe(true);
    expect(verifyInternalApiKey("internal-key", "other-key")).toBe(false);
    expect(verifyInternalApiKey(undefined, "internal-key")).toBe(false);
  });

  it("sanitizes correlation identifiers", () => {
    expect(safeCorrelationId("request/with spaces")).toBe("requestwithspaces");
  });
});
