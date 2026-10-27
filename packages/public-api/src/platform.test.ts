import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { API_ENVIRONMENTS, API_SCOPES, BOOKING_SCOPES, INVOICE_SCOPES, PUBLIC_WEBHOOK_EVENTS } from "./contracts";
import { errorBody, PublicApiError } from "./response";
import { generateApiKey, hashApiKey, validateWebhookUrl } from "./security";

const repoRoot = path.resolve(process.cwd(), "../..");
const platformMigration = fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260824261000_public_api_platform.sql"), "utf8");
const automationMigration = fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260824262000_booking_invoice_automation.sql"), "utf8");
const externalReferenceMigration = fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260824266000_public_api_atomic_external_references.sql"), "utf8");
const bookingPublicAttemptFixMigration = fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260824267000_booking_public_attempt_ip_hash_fix.sql"), "utf8");
const gateway = fs.readFileSync(path.join(repoRoot, "apps/OperiX Public API/src/app/v1/[...path]/route.ts"), "utf8");
const openapi = JSON.parse(fs.readFileSync(path.join(repoRoot, "packages/public-api/openapi.json"), "utf8")) as { paths: Record<string, Record<string, unknown>>; components?: { schemas?: Record<string, any> } };

test("public scope catalog is explicit and separated by product", () => {
  assert.equal(new Set(API_SCOPES).size, API_SCOPES.length);
  assert.ok(INVOICE_SCOPES.every((scope) => API_SCOPES.includes(scope)));
  assert.ok(BOOKING_SCOPES.every((scope) => API_SCOPES.includes(scope)));
  assert.ok(INVOICE_SCOPES.every((scope) => !scope.startsWith("booking")));
  assert.ok(BOOKING_SCOPES.every((scope) => !scope.startsWith("invoice")));
  assert.deepEqual(API_ENVIRONMENTS, ["test", "live"]);
});

test("migration keeps API credentials and control data server-owned", () => {
  for (const table of ["api_keys", "api_key_scopes", "api_idempotency_keys", "api_usage", "api_request_logs", "api_rate_limit_windows", "api_addon_subscriptions", "api_access_overrides", "api_webhook_endpoints", "api_webhook_events", "api_webhook_deliveries", "booking_invoice_automation_settings", "booking_invoice_links", "booking_invoice_jobs"]) {
    assert.match(platformMigration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(platformMigration, /revoke all on public\.api_keys[\s\S]*from anon/i);
  assert.match(platformMigration, /key_hash text not null check \(key_hash like 'sha256:%'\)/i);
  assert.doesNotMatch(platformMigration, /api_keys[\s\S]*\bplaintext_key\b/i);
  assert.match(platformMigration, /private\.operix_server_request\(\)/i);
  assert.match(fs.readFileSync(path.join(repoRoot, "supabase/migrations/20260824268000_server_request_claims_compat.sql"), "utf8"), /request\.jwt\.claims[\s\S]*->> 'role'/i);
});

test("native automation and webhook outbox use durable database triggers", () => {
  assert.match(automationMigration, /create trigger api_invoice_webhook_events/i);
  assert.match(automationMigration, /create trigger api_booking_webhook_events/i);
  assert.match(automationMigration, /private\.api_enqueue_webhook_event/i);
  assert.match(platformMigration, /unique \(company_id, booking_id\)/i);
  assert.match(platformMigration, /unique \(company_id, environment, idempotency_key\)/i);
  assert.match(automationMigration, /booking_invoice_claim_jobs/i);
});

test("public booking rate limiting uses an unambiguous hashed request key", () => {
  assert.match(bookingPublicAttemptFixMigration, /ip_hash_value\s+text/i);
  assert.match(bookingPublicAttemptFixMigration, /attempt\.ip_hash\s*=\s*ip_hash_value/i);
  assert.match(bookingPublicAttemptFixMigration, /grant execute on function public\.booking_public_create[\s\S]*to service_role/i);
});

test("critical external references are persisted through atomic domain wrappers", () => {
  assert.match(externalReferenceMigration, /save_invoice_document_with_external_reference/);
  assert.match(externalReferenceMigration, /booking_create_with_external_reference/);
  assert.match(externalReferenceMigration, /booking_update_with_external_reference/);
  assert.match(externalReferenceMigration, /jsonb_set\(event_row\.payload/);
  assert.match(gateway, /externalReference: parsed\.external_reference/);
});

test("gateway routes critical mutations through canonical services and controls", () => {
  assert.match(gateway, /resolveApiKey/);
  assert.match(gateway, /api_check_product_access/);
  assert.match(gateway, /requireIdempotency/);
  assert.match(gateway, /saveInvoiceDocument/);
  assert.match(gateway, /getAvailableSlots/);
  assert.match(gateway, /createBooking/);
  assert.match(gateway, /transitionBooking/);
  assert.match(gateway, /transitionInvoiceStatus/);
  assert.match(gateway, /setExternalReference/);
  assert.match(gateway, /idempotencyKey: domainIdempotencyKey\(state\)/);
  assert.doesNotMatch(gateway, /tenant_id\s*:/i);
});

test("every OpenAPI operation has a stable scope and response contract", () => {
  let operations = 0;
  for (const [route, item] of Object.entries(openapi.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!["get", "post", "patch", "put", "delete"].includes(method)) continue;
      operations += 1;
      const record = operation as Record<string, unknown>;
      assert.match(String(record["x-operix-scope"] || ""), /^[a-z_]+:[a-z_]+$/i, `${method.toUpperCase()} ${route} needs a scope`);
      assert.ok(record.responses && Object.keys(record.responses as object).length > 0, `${method.toUpperCase()} ${route} needs responses`);
    }
  }
  assert.equal(operations, 46);
  const schemas = openapi.components?.schemas || {};
  assert.ok(Array.isArray(schemas.Envelope?.properties?.data?.oneOf), "single-resource responses need typed data schemas");
  assert.ok(Array.isArray(schemas.Collection?.properties?.data?.items?.oneOf), "collection responses need typed item schemas");
  for (const schema of ["Customer", "Product", "Invoice", "Payment", "Service", "Provider", "Location", "Resource", "AvailabilitySlot", "Booking"]) {
    assert.ok(schemas[schema], `public response schema ${schema} is missing`);
  }
});

test("security failures keep stable public error shape", () => {
  const result = errorBody(new PublicApiError(403, "missing_scope", "The API key requires invoice:read."), "req_test");
  assert.equal(result.status, 403);
  assert.deepEqual(result.body.error, { code: "missing_scope", message: "The API key requires invoice:read.", request_id: "req_test" });
  assert.equal(errorBody(new Error("SQL relation invoices leaked"), "req_test").body.error.code, "internal_error");
});

test("key and webhook invariants remain safe for malformed input", () => {
  const testKey = generateApiKey("test").value;
  const liveKey = generateApiKey("live").value;
  assert.match(testKey, /^opx_test_[A-Za-z0-9_-]{40,}$/);
  assert.match(liveKey, /^opx_live_[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(hashApiKey(testKey), testKey);
  for (const url of ["https://localhost/webhook", "https://127.0.0.1/webhook", "https://169.254.169.254/latest/meta-data", "http://example.com/webhook"]) {
    assert.equal(validateWebhookUrl(url).ok, false, url);
  }
  assert.ok(PUBLIC_WEBHOOK_EVENTS.includes("invoice.finalized"));
  assert.ok(PUBLIC_WEBHOOK_EVENTS.includes("booking.completed"));
});
