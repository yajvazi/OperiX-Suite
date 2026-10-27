import { z } from "zod";

export const API_ENVIRONMENTS = ["test", "live"] as const;
export type ApiEnvironment = (typeof API_ENVIRONMENTS)[number];

export const INVOICE_SCOPES = [
  "invoice:read", "invoice:write", "invoice:finalize", "invoice:void",
  "customer:read", "customer:write", "product:read", "product:write",
  "payment:read", "payment:write", "document:read", "document:write",
] as const;

export const BOOKING_SCOPES = [
  "booking:read", "booking:write", "booking:cancel", "availability:read",
  "service:read", "service:write", "provider:read", "provider:write",
  "resource:read", "resource:write", "location:read", "location:write",
  "booking_customer:read", "booking_customer:write",
] as const;

export const API_SCOPES = [...INVOICE_SCOPES, ...BOOKING_SCOPES] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Client-safe event catalog used by the developer settings UI and server webhook outbox. */
export const PUBLIC_WEBHOOK_EVENTS = [
  "invoice.created", "invoice.finalized", "invoice.paid", "invoice.partially_paid", "invoice.overdue", "invoice.voided",
  "payment.created", "customer.created", "booking.created", "booking.confirmed", "booking.rescheduled", "booking.cancelled",
  "booking.checked_in", "booking.completed", "booking.no_show",
] as const;

export const apiEnvironmentSchema = z.enum(API_ENVIRONMENTS);
export const apiScopeSchema = z.enum(API_SCOPES);

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  environment: apiEnvironmentSchema,
  scopes: z.array(apiScopeSchema).min(1).max(API_SCOPES.length),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

export const externalReferenceSchema = z.string().trim().min(1).max(160);

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

export interface ApiKeyRecord {
  id: string;
  company_id: string;
  environment: ApiEnvironment;
  name: string;
  key_prefix: string;
  scopes: ApiScope[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface ResolvedApiKey extends ApiKeyRecord {
  key_hash: string;
}

export interface ApiRequestContext {
  requestId: string;
  environment: ApiEnvironment;
  companyId: string;
  apiKeyId: string;
  scopes: readonly ApiScope[];
  keyName: string;
  keyPrefix: string;
  createdBy: string | null;
}

export function hasScope(context: Pick<ApiRequestContext, "scopes">, scope: ApiScope) {
  return context.scopes.includes(scope);
}

export function scopeFamily(scope: ApiScope) {
  return scope.split(":", 1)[0];
}

export function publicKeyIdentifier(value: Pick<ApiKeyRecord, "key_prefix">) {
  return `${value.key_prefix}••••••••`;
}

export function apiKeyResponse(record: ApiKeyRecord) {
  return {
    id: record.id,
    name: record.name,
    environment: record.environment,
    key: publicKeyIdentifier(record),
    scopes: record.scopes,
    created_at: record.created_at,
    last_used_at: record.last_used_at,
    expires_at: record.expires_at,
    revoked_at: record.revoked_at,
  };
}

export function resourceReference(row: Record<string, unknown>) {
  return {
    id: row.id,
    external_reference: row.external_reference ?? null,
  };
}
