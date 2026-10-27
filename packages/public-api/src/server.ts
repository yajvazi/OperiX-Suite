import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ApiEnvironment, ApiScope, ResolvedApiKey } from "./contracts";
import { API_ENVIRONMENTS } from "./contracts";
import { hashApiKey, verifyApiKey } from "./security";
import { PublicApiError } from "./response";

export interface PublicApiRuntimeConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  jwtSecret: string;
}

export function runtimeConfig(environment: ApiEnvironment): PublicApiRuntimeConfig {
  const supabaseUrl = environment === "test" ? process.env.PUBLIC_API_TEST_SUPABASE_URL || "" : process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = environment === "test" ? process.env.PUBLIC_API_TEST_SUPABASE_SERVICE_ROLE_KEY || "" : process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const jwtSecret = environment === "test" ? process.env.PUBLIC_API_TEST_SUPABASE_JWT_SECRET || "" : process.env.SUPABASE_JWT_SECRET || "";
  if (!supabaseUrl || !serviceRoleKey || !jwtSecret) throw new PublicApiError(503, "api_not_configured", `${environment === "test" ? "Test" : "Live"} API infrastructure is not configured.`);
  return { supabaseUrl, serviceRoleKey, jwtSecret };
}

export function adminClient(config: PublicApiRuntimeConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signedTenantJwt(userId: string, secret: string) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ aud: "authenticated", role: "authenticated", sub: userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 }));
  const signature = base64Url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

export function tenantClient(config: PublicApiRuntimeConfig, createdBy: string): SupabaseClient {
  const token = signedTenantJwt(createdBy, config.jwtSecret);
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function bearerValue(authorization: string | null) {
  if (!authorization) throw new PublicApiError(401, "invalid_api_key", "A Bearer API key is required.");
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match || !match[1]) throw new PublicApiError(401, "invalid_api_key", "The Authorization header must contain a Bearer API key.");
  return match[1];
}

function mapApiKey(row: Record<string, unknown>, scopes: ApiScope[]): ResolvedApiKey {
  return {
    id: String(row.id), company_id: String(row.company_id), environment: row.environment as ApiEnvironment,
    name: String(row.name), key_prefix: String(row.key_prefix), key_hash: String(row.key_hash), scopes,
    created_by: row.created_by ? String(row.created_by) : null, created_at: String(row.created_at),
    last_used_at: row.last_used_at ? String(row.last_used_at) : null, expires_at: row.expires_at ? String(row.expires_at) : null,
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
  };
}

export async function resolveApiKey(client: SupabaseClient, authorization: string | null, expectedEnvironment?: ApiEnvironment) {
  const value = bearerValue(authorization);
  const environmentFromPrefix = value.match(/^opx_(test|live)_/i)?.[1] as ApiEnvironment | undefined;
  if (!environmentFromPrefix || !API_ENVIRONMENTS.includes(environmentFromPrefix)) throw new PublicApiError(401, "invalid_api_key", "The API key format is invalid.");
  if (expectedEnvironment && environmentFromPrefix !== expectedEnvironment) throw new PublicApiError(401, "wrong_environment", "This credential belongs to a different API environment.");
  const keyHash = hashApiKey(value);
  const { data: row, error } = await client.from("api_keys").select("id,company_id,environment,name,key_prefix,key_hash,created_by,created_at,last_used_at,expires_at,revoked_at").eq("key_hash", keyHash).eq("environment", environmentFromPrefix).maybeSingle();
  if (error || !row || !verifyApiKey(value, String((row as Record<string, unknown>).key_hash))) throw new PublicApiError(401, "invalid_api_key", "The API key is invalid.");
  const typed = row as Record<string, unknown>;
  if (typed.revoked_at) throw new PublicApiError(401, "api_key_revoked", "The API key has been revoked.");
  if (typed.expires_at && new Date(String(typed.expires_at)).getTime() <= Date.now()) throw new PublicApiError(401, "api_key_expired", "The API key has expired.");
  const { data: scopeRows, error: scopeError } = await client.from("api_key_scopes").select("scope").eq("api_key_id", String(typed.id));
  if (scopeError) throw new PublicApiError(503, "api_auth_unavailable", "API authorization is temporarily unavailable.");
  await client.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", String(typed.id));
  return mapApiKey(typed, (scopeRows || []).map((scope) => String((scope as { scope: string }).scope) as ApiScope));
}

export function assertApiEnvironment(environment: string | null | undefined): asserts environment is ApiEnvironment {
  if (!environment || !API_ENVIRONMENTS.includes(environment as ApiEnvironment)) throw new PublicApiError(400, "invalid_environment", "The API environment is invalid.");
}
