import { NextResponse } from "next/server";
import { z } from "zod";
import { API_ENVIRONMENTS, API_SCOPES, apiScopeSchema } from "@invoice-monorepo/public-api/contracts";
import { developerContext, developerEntitlement, DeveloperAccessError, safeError } from "@/lib/developers";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  environment: z.enum(API_ENVIRONMENTS),
  scopes: z.array(apiScopeSchema).min(1).max(API_SCOPES.length),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

export async function GET() {
  try {
    const { client, companyId } = await developerContext();
    const { data, error } = await client.from("api_keys").select("id,name,environment,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at").eq("company_id", companyId).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data || [] }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : "API keys could not be loaded." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { client, companyId } = await developerContext();
    const entitlement = await developerEntitlement(client, companyId);
    if (entitlement.api_addon !== true) throw new DeveloperAccessError("An active OperiX API Add-on is required to create API keys.", 403);
    const input = createSchema.parse(await request.json());
    const { data, error } = await client.rpc("api_create_key", { p_company_id: companyId, p_name: input.name, p_environment: input.environment, p_scopes: input.scopes, p_expires_at: input.expires_at || null });
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : error instanceof z.ZodError ? 422 : 500;
    if (!(error instanceof DeveloperAccessError) && !(error instanceof z.ZodError)) console.error("API key creation failed", safeError(error, "unknown error"));
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : error instanceof z.ZodError ? "The API key details are invalid." : "The API key could not be created." }, { status });
  }
}
