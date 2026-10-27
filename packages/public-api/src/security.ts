import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { ApiEnvironment } from "./contracts";

const KEY_RANDOM_BYTES = 32;
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export function generateApiKey(environment: ApiEnvironment) {
  const value = `opx_${environment}_${randomBytes(KEY_RANDOM_BYTES).toString("base64url")}`;
  return {
    value,
    hash: hashApiKey(value),
    prefix: `${value.slice(0, 13)}…${value.slice(-4)}`,
  };
}

export function hashApiKey(value: string) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function verifyApiKey(value: string, expectedHash: string) {
  const actual = Buffer.from(hashApiKey(value), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function requestId() {
  return `req_${randomBytes(12).toString("base64url")}`;
}

export function eventId() {
  return `evt_${randomBytes(16).toString("base64url")}`;
}

export function idempotencyFingerprint(method: string, path: string, body: unknown) {
  return createHash("sha256")
    .update(method.toUpperCase(), "utf8")
    .update("\n", "utf8")
    .update(path, "utf8")
    .update("\n", "utf8")
    .update(stableJson(body), "utf8")
    .digest("hex");
}

/**
 * The public contract accepts readable Idempotency-Key values, while the
 * existing Invoice financial RPCs use UUID columns. Keep that boundary
 * conversion deterministic so a retry reaches the same domain idempotency
 * record without changing the canonical RPC contract.
 */
export function idempotencyUuid(value: string) {
  const bytes = createHash("sha256").update(value, "utf8").digest();
  // UUID v5-shaped bytes: deterministic, with the RFC variant bits set.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(",")}}`;
}

function ipv4Parts(hostname: string) {
  if (isIP(hostname) !== 4) return null;
  const parts = hostname.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  if (normalized === "metadata.google.internal" || normalized === "metadata" || normalized === "instance-data") return true;
  const parts = ipv4Parts(normalized);
  if (parts) {
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(normalized) === 6) {
    const compact = normalized.toLowerCase();
    return compact === "::1" || compact === "::" || compact.startsWith("fc") || compact.startsWith("fd") || compact.startsWith("fe80:") || (compact.startsWith("::ffff:") && isPrivateHostname(compact.slice(7)));
  }
  return false;
}

export function validateWebhookUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false as const, reason: "The webhook URL is invalid." };
  }
  if (parsed.protocol !== "https:") return { ok: false as const, reason: "Webhook endpoints must use HTTPS." };
  if (parsed.username || parsed.password) return { ok: false as const, reason: "Webhook URLs cannot contain credentials." };
  if (parsed.port && parsed.port !== "443") return { ok: false as const, reason: "Webhook endpoints must use the HTTPS port." };
  if (isPrivateHostname(parsed.hostname)) return { ok: false as const, reason: "Webhook endpoints cannot target private or metadata addresses." };
  return { ok: true as const, url: parsed.toString() };
}

export async function resolveWebhookDestination(value: string) {
  const parsed = validateWebhookUrl(value);
  if (!parsed.ok) return parsed;
  try {
    const addresses = await lookup(new URL(parsed.url).hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((address) => isPrivateHostname(address.address))) return { ok: false as const, reason: "Webhook endpoints cannot resolve to private or metadata addresses." };
    const address = addresses[0];
    return { ok: true as const, url: parsed.url, address: address.address, family: address.family };
  } catch {
    return { ok: false as const, reason: "The webhook hostname could not be resolved." };
  }
}

export async function validateWebhookDestination(value: string) {
  const resolved = await resolveWebhookDestination(value);
  return resolved.ok ? { ok: true as const, url: resolved.url } : resolved;
}

export function encryptSecret(secret: string, encryptionKey: string) {
  const { createCipheriv } = require("node:crypto") as typeof import("node:crypto");
  const key = createHash("sha256").update(encryptionKey, "utf8").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(ciphertext: string, encryptionKey: string) {
  const { createDecipheriv } = require("node:crypto") as typeof import("node:crypto");
  const [version, ivValue, tagValue, dataValue] = ciphertext.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !dataValue) throw new Error("Invalid encrypted secret.");
  const key = createHash("sha256").update(encryptionKey, "utf8").digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataValue, "base64url")), decipher.final()]).toString("utf8");
}

export function webhookSignature(secret: string, timestamp: number, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function verifyWebhookSignature(secret: string, signatureHeader: string | null, rawBody: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!signatureHeader) return false;
  const fields = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const index = part.indexOf("=");
    return index === -1 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
  }));
  const timestamp = Number(fields.t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS || !fields.v1) return false;
  const actual = Buffer.from(webhookSignature(secret, timestamp, rawBody), "utf8");
  const expected = Buffer.from(fields.v1, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function signHandoff(payload: Record<string, unknown>, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded, "utf8").digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyHandoff<T extends Record<string, unknown>>(token: string, secret: string): T | null {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) return null;
  const expected = createHmac("sha256", secret).update(encoded, "utf8").digest("base64url");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(provided, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  const sensitive = /key|secret|token|password|authorization|cookie|signature/i;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sensitive.test(key) ? "[REDACTED]" : redactSensitive(entry)]));
}
