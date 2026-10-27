import https from "node:https";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PUBLIC_WEBHOOK_EVENTS, type ApiEnvironment } from "./contracts";
import { eventId, decryptSecret, encryptSecret, resolveWebhookDestination, validateWebhookDestination, validateWebhookUrl, webhookSignature } from "./security";
import { PublicApiError } from "./response";
export { PUBLIC_WEBHOOK_EVENTS } from "./contracts";

function postWebhook(destination: { url: string; address: string; family: number }, headers: Record<string, string>, rawBody: string) {
  const target = new URL(destination.url);
  return new Promise<number>((resolve, reject) => {
    const request = https.request({
      protocol: "https:",
      hostname: destination.address,
      family: destination.family,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: "POST",
      servername: target.hostname,
      headers: { ...headers, host: target.host, "content-length": String(Buffer.byteLength(rawBody)) },
      rejectUnauthorized: true,
      timeout: 10_000,
    }, (response) => {
      response.resume();
      resolve(response.statusCode || 0);
    });
    request.once("timeout", () => request.destroy(new Error("Webhook request timed out.")));
    request.once("error", reject);
    request.end(rawBody);
  });
}

export function webhookSecret() {
  const encryptionKey = process.env.PUBLIC_API_WEBHOOK_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) throw new PublicApiError(503, "webhook_not_configured", "Webhook secret management is not configured.");
  return { encryptionKey };
}

export async function createWebhookEndpoint(client: SupabaseClient, input: { companyId: string; createdBy: string; name: string; url: string; environment: ApiEnvironment; events: string[] }) {
  if (!input.events.length || input.events.some((event) => !(PUBLIC_WEBHOOK_EVENTS as readonly string[]).includes(event))) throw new PublicApiError(422, "invalid_webhook_events", "One or more webhook events are not supported.");
  const validation = validateWebhookUrl(input.url);
  if (!validation.ok) throw new PublicApiError(422, "invalid_webhook_url", validation.reason);
  const destination = await validateWebhookDestination(input.url);
  if (!destination.ok) throw new PublicApiError(422, "invalid_webhook_url", destination.reason);
  const { encryptionKey } = webhookSecret();
  const { randomBytes, createHash } = await import("node:crypto");
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const row = await client.from("api_webhook_endpoints").insert({ company_id: input.companyId, name: input.name.trim(), endpoint_url: validation.url, environment: input.environment, subscribed_events: input.events, secret_prefix: `${secret.slice(0, 14)}…${secret.slice(-4)}`, secret_hash: `sha256:${createHash("sha256").update(secret).digest("hex")}`, secret_ciphertext: encryptSecret(secret, encryptionKey), created_by: input.createdBy }).select("id,name,endpoint_url,environment,subscribed_events,status,secret_prefix,created_at").single();
  if (row.error) throw row.error;
  return { endpoint: row.data, secret };
}

export async function rotateWebhookSecret(client: SupabaseClient, companyId: string, endpointId: string) {
  const { encryptionKey } = webhookSecret();
  const { randomBytes, createHash } = await import("node:crypto");
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const result = await client.from("api_webhook_endpoints").update({ secret_prefix: `${secret.slice(0, 14)}…${secret.slice(-4)}`, secret_hash: `sha256:${createHash("sha256").update(secret).digest("hex")}`, secret_ciphertext: encryptSecret(secret, encryptionKey), updated_at: new Date().toISOString() }).eq("id", endpointId).eq("company_id", companyId).select("id,secret_prefix").single();
  if (result.error) throw result.error;
  return { endpoint: result.data, secret };
}

export async function emitWebhookEvent(client: SupabaseClient, input: { companyId: string; environment: ApiEnvironment; type: string; objectId?: string | null; object: unknown }) {
  if (!(PUBLIC_WEBHOOK_EVENTS as readonly string[]).includes(input.type)) return null;
  const created = new Date().toISOString();
  const identifier = eventId();
  const createdEvent = await client.from("api_webhook_events").insert({ event_id: identifier, company_id: input.companyId, environment: input.environment, event_type: input.type, object_id: input.objectId || null, payload: { id: identifier, type: input.type, created_at: created, data: { object: input.object } } }).select("id,event_id,payload").single();
  if (createdEvent.error) throw createdEvent.error;
  const endpoints = await client.from("api_webhook_endpoints").select("id").eq("company_id", input.companyId).eq("environment", input.environment).eq("status", "active").contains("subscribed_events", [input.type]);
  if (endpoints.error) throw endpoints.error;
  if ((endpoints.data || []).length) {
    const deliveries = (endpoints.data || []).map((endpoint) => ({ event_id: createdEvent.data.id, endpoint_id: endpoint.id, status: "pending", next_attempt_at: created }));
    const inserted = await client.from("api_webhook_deliveries").insert(deliveries);
    if (inserted.error) throw inserted.error;
  }
  return createdEvent.data;
}

export async function deliverWebhookDelivery(client: SupabaseClient, deliveryId: string) {
  const encryptionKey = process.env.PUBLIC_API_WEBHOOK_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) throw new Error("Webhook secret management is not configured.");
  const row = await client.from("api_webhook_deliveries").select("id,attempt,status,event_id,endpoint_id,api_webhook_events(event_id,company_id,environment,event_type,payload),api_webhook_endpoints(endpoint_url,secret_ciphertext,status)").eq("id", deliveryId).maybeSingle();
  if (row.error || !row.data) return { status: "missing" as const };
  const delivery = row.data as Record<string, unknown>;
  const endpoint = (delivery.api_webhook_endpoints || {}) as Record<string, unknown>;
  const event = (delivery.api_webhook_events || {}) as Record<string, unknown>;
  if (endpoint.status !== "active") return { status: "canceled" as const };
  const claimTime = new Date().toISOString();
  const claim = await client.from("api_webhook_deliveries")
    .update({ status: "delivering", attempt: Number(delivery.attempt || 0) + 1, updated_at: claimTime })
    .eq("id", deliveryId)
    .in("status", ["pending", "failed"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${claimTime}`)
    .select("id,attempt,status")
    .maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) return { status: "in_progress" as const };
  delivery.attempt = Number((claim.data as Record<string, unknown>).attempt || 1);
  const destination = await resolveWebhookDestination(String(endpoint.endpoint_url));
  if (!destination.ok) {
    await client.from("api_webhook_deliveries").update({ status: "exhausted", error_message: destination.reason, next_attempt_at: null, updated_at: new Date().toISOString() }).eq("id", deliveryId);
    await client.rpc("api_record_webhook_result", { p_endpoint_id: String(delivery.endpoint_id), p_delivered: false });
    return { status: "failed" as const };
  }
  const rawBody = JSON.stringify(event.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = decryptSecret(String(endpoint.secret_ciphertext), encryptionKey);
  const started = Date.now();
  let statusCode: number | null = null;
  let errorMessage: string | null = null;
  try {
    statusCode = await postWebhook(destination, { "content-type": "application/json", "user-agent": "OperiX-Webhooks/1.0", "x-operix-event": String(event.event_type), "x-operix-event-id": String(event.event_id), "x-operix-signature": `t=${timestamp},v1=${webhookSignature(secret, timestamp, rawBody)}` }, rawBody);
    const attempt = Number(delivery.attempt || 1);
    const delivered = statusCode >= 200 && statusCode < 300;
    const nextAttemptAt = delivered ? null : new Date(Date.now() + Math.min(24 * 60 * 60 * 1000, 1000 * 2 ** Math.min(attempt, 10))).toISOString();
    await client.from("api_webhook_deliveries").update({ attempt, status: delivered ? "delivered" : attempt >= 8 ? "exhausted" : "failed", status_code: statusCode, response_time_ms: Date.now() - started, response_excerpt: null, next_attempt_at: nextAttemptAt, delivered_at: delivered ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", deliveryId);
    await client.rpc("api_record_webhook_result", { p_endpoint_id: String(delivery.endpoint_id), p_delivered: delivered });
    return { status: delivered ? "delivered" as const : "failed" as const, statusCode };
  } catch (error) {
    errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Webhook delivery failed.";
    const attempt = Number(delivery.attempt || 1);
    await client.from("api_webhook_deliveries").update({ attempt, status: attempt >= 8 ? "exhausted" : "failed", error_message: errorMessage, response_time_ms: Date.now() - started, next_attempt_at: attempt >= 8 ? null : new Date(Date.now() + Math.min(24 * 60 * 60 * 1000, 1000 * 2 ** Math.min(attempt, 10))).toISOString(), updated_at: new Date().toISOString() }).eq("id", deliveryId);
    await client.rpc("api_record_webhook_result", { p_endpoint_id: String(delivery.endpoint_id), p_delivered: false });
    return { status: "failed" as const, statusCode: null };
  }
}
