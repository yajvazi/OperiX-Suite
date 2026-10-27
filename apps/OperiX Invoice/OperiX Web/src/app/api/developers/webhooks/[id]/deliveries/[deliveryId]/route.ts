import { NextResponse } from "next/server";
import { developerContext, developerEntitlement, DeveloperAccessError } from "@/lib/developers";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; deliveryId: string }> }) {
  try {
    const { admin, client, companyId } = await developerContext();
    const entitlement = await developerEntitlement(client, companyId);
    if (entitlement.api_addon !== true) throw new DeveloperAccessError("An active OperiX API Add-on is required to retry webhook deliveries.", 403);
    const { id, deliveryId } = await params;
    const endpoint = await admin.from("api_webhook_endpoints").select("id").eq("id", id).eq("company_id", companyId).maybeSingle();
    if (endpoint.error || !endpoint.data) return NextResponse.json({ error: "The webhook endpoint was not found." }, { status: 404 });
    const { data, error } = await admin.from("api_webhook_deliveries").update({ status: "pending", attempt: 0, next_attempt_at: new Date().toISOString(), error_message: null, status_code: null, response_time_ms: null, delivered_at: null, updated_at: new Date().toISOString() }).eq("id", deliveryId).eq("endpoint_id", id).select("id,status,attempt,next_attempt_at").single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : "The webhook delivery could not be queued." }, { status });
  }
}
