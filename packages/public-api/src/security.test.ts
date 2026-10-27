import test from "node:test";
import assert from "node:assert/strict";

import { generateApiKey, idempotencyFingerprint, idempotencyUuid, signHandoff, validateWebhookUrl, verifyApiKey, verifyHandoff, verifyWebhookSignature, webhookSignature } from "./security";

test("API keys are prefixed, random, and only hashes verify", () => {
  const first = generateApiKey("live");
  const second = generateApiKey("live");
  assert.match(first.value, /^opx_live_[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first.value, second.value);
  assert.equal(verifyApiKey(first.value, first.hash), true);
  assert.equal(verifyApiKey(second.value, first.hash), false);
  assert.equal(first.hash.includes(first.value), false);
});

test("idempotency fingerprints are stable and operation-specific", () => {
  assert.equal(idempotencyFingerprint("post", "/v1/invoice/invoices", { b: 2, a: 1 }), idempotencyFingerprint("POST", "/v1/invoice/invoices", { a: 1, b: 2 }));
  assert.notEqual(idempotencyFingerprint("POST", "/v1/invoice/invoices", { a: 1 }), idempotencyFingerprint("POST", "/v1/booking/bookings", { a: 1 }));
  const domainKey = idempotencyUuid("order-58391-invoice");
  assert.match(domainKey, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(domainKey, idempotencyUuid("order-58391-invoice"));
});

test("webhook signatures protect timestamps and raw payloads", () => {
  const timestamp = 1_800_000_000;
  const body = JSON.stringify({ id: "evt_1" });
  const signature = webhookSignature("whsec_test", timestamp, body);
  assert.equal(verifyWebhookSignature("whsec_test", `t=${timestamp},v1=${signature}`, body, timestamp), true);
  assert.equal(verifyWebhookSignature("whsec_test", `t=${timestamp - 301},v1=${signature}`, body, timestamp), false);
  assert.equal(verifyWebhookSignature("wrong", `t=${timestamp},v1=${signature}`, body, timestamp), false);
});

test("short-lived PDF handoffs retain an explicit environment", () => {
  const token = signHandoff({ invoice_id: "invoice", company_id: "company", environment: "test", exp: Date.now() + 60_000 }, "test-secret");
  assert.equal(verifyHandoff<{ environment: string }>(token, "test-secret")?.environment, "test");
  assert.equal(verifyHandoff(token, "live-secret"), null);
});

test("webhook URL validation rejects SSRF targets", () => {
  assert.equal(validateWebhookUrl("https://example.com/hooks").ok, true);
  assert.equal(validateWebhookUrl("http://example.com/hooks").ok, false);
  assert.equal(validateWebhookUrl("https://127.0.0.1/hooks").ok, false);
  assert.equal(validateWebhookUrl("https://169.254.169.254/latest/meta-data").ok, false);
  assert.equal(validateWebhookUrl("https://service.internal/hooks").ok, false);
});
