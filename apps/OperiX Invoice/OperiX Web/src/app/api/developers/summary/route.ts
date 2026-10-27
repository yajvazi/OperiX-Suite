import { NextResponse } from "next/server";
import { developerContext, developerEntitlement, DeveloperAccessError, safeError } from "@/lib/developers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { admin, client, companyId } = await developerContext();
    const entitlement = await developerEntitlement(client, companyId);
    const now = new Date();
    const fallbackPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const fallbackPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const periodStart = entitlement.period_start ? new Date(entitlement.period_start) : fallbackPeriodStart;
    const periodEnd = entitlement.period_end ? new Date(entitlement.period_end) : fallbackPeriodEnd;
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd <= periodStart) {
      periodStart.setTime(fallbackPeriodStart.getTime());
      periodEnd.setTime(fallbackPeriodEnd.getTime());
    }
    const [keysResult, webhooksResult, usageResult, logsResult] = await Promise.all([
      client.from("api_keys").select("id,name,environment,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at").eq("company_id", companyId).order("created_at", { ascending: false }),
      client.from("api_webhook_endpoints").select("id,name,endpoint_url,environment,subscribed_events,status,secret_prefix,last_delivery_at,failure_count,success_count,created_at").eq("company_id", companyId).neq("status", "deleted").order("created_at", { ascending: false }),
      client.rpc("api_usage_summary", { p_company_id: companyId, p_environment: "live", p_from: periodStart.toISOString(), p_to: periodEnd.toISOString() }),
      client.from("api_request_logs").select("request_id,method,endpoint,response_status,duration_ms,occurred_at,api_key_id").eq("company_id", companyId).order("occurred_at", { ascending: false }).limit(50),
    ]);
    const failed = [keysResult, webhooksResult, usageResult, logsResult].find((result) => result.error);
    if (failed?.error) throw failed.error;
    const endpointIds = (webhooksResult.data || []).map((endpoint) => endpoint.id);
    const deliveriesResult = endpointIds.length
      ? await admin.from("api_webhook_deliveries").select("id,endpoint_id,status,attempt,status_code,response_time_ms,error_message,next_attempt_at,delivered_at,created_at,updated_at").in("endpoint_id", endpointIds).order("created_at", { ascending: false }).limit(100)
      : { data: [], error: null };
    if (deliveriesResult.error) throw deliveriesResult.error;
    return NextResponse.json({
      companyId,
      entitlement: {
        ...entitlement,
        included_requests: Number(entitlement.included_requests || 5000),
        overage_price: "1.00",
        overage_requests: 10000,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
      },
      keys: keysResult.data || [],
      webhooks: webhooksResult.data || [],
      deliveries: deliveriesResult.data || [],
      usage: usageResult.data || { requests: 0, successful: 0, failed: 0, requests_today: 0, top_endpoints: [], by_key: [] },
      logs: logsResult.data || [],
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : 500;
    if (!(error instanceof DeveloperAccessError)) console.error("Developer summary failed", safeError(error, "unknown error"));
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : "Developer settings could not be loaded." }, { status });
  }
}
