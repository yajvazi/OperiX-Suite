import { NextResponse } from "next/server";
import { developerContext, developerEntitlement, DeveloperAccessError, safeError } from "@/lib/developers";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client, companyId } = await developerContext();
    const { id } = await params;
    const { error } = await client.rpc("api_revoke_key", { p_company_id: companyId, p_key_id: id });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : "The API key could not be revoked." }, { status });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client, companyId } = await developerContext();
    const entitlement = await developerEntitlement(client, companyId);
    if (entitlement.api_addon !== true) throw new DeveloperAccessError("An active OperiX API Add-on is required to rotate API keys.", 403);
    const { id } = await params;
    const { data, error } = await client.rpc("api_rotate_key", { p_company_id: companyId, p_key_id: id });
    if (error) throw error;
    return NextResponse.json({ data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : 500;
    if (!(error instanceof DeveloperAccessError)) console.error("API key rotation failed", safeError(error, "unknown error"));
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : "The API key could not be rotated." }, { status });
  }
}
