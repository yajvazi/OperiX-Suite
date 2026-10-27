import { NextResponse } from "next/server";
import { z } from "zod";
import { rotateWebhookSecret, PUBLIC_WEBHOOK_EVENTS } from "@invoice-monorepo/public-api/webhooks";
import { developerContext, developerEntitlement, DeveloperAccessError, safeError } from "@/lib/developers";

export const runtime = "nodejs";

const updateSchema = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  events: z.array(z.string()).min(1).max(PUBLIC_WEBHOOK_EVENTS.length).optional(),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin, client, companyId } = await developerContext();
    const entitlement = await developerEntitlement(client, companyId);
    if (entitlement.api_addon !== true) throw new DeveloperAccessError("An active OperiX API Add-on is required to manage webhooks.", 403);
    const input = updateSchema.parse(await request.json());
    if (input.events?.some((event) => !(PUBLIC_WEBHOOK_EVENTS as readonly string[]).includes(event))) throw new DeveloperAccessError("One or more webhook events are not supported.", 422);
    const { id } = await params;
    const { data, error } = await admin.from("api_webhook_endpoints").update({ ...(input.status ? { status: input.status } : {}), ...(input.events ? { subscribed_events: input.events } : {}), updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId).neq("status", "deleted").select("id,name,endpoint_url,environment,subscribed_events,status,secret_prefix,last_delivery_at,failure_count,success_count").single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : error instanceof z.ZodError ? 422 : 500;
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : error instanceof z.ZodError ? "The webhook update is invalid." : "The webhook endpoint could not be updated." }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin, client, companyId } = await developerContext();
    const entitlement = await developerEntitlement(client, companyId);
    if (entitlement.api_addon !== true) throw new DeveloperAccessError("An active OperiX API Add-on is required to manage webhooks.", 403);
    const { id } = await params;
    const { error } = await admin.from("api_webhook_endpoints").update({ status: "deleted", updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", companyId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : 500;
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : "The webhook endpoint could not be deleted." }, { status });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin, client, companyId } = await developerContext();
    const entitlement = await developerEntitlement(client, companyId);
    if (entitlement.api_addon !== true) throw new DeveloperAccessError("An active OperiX API Add-on is required to rotate webhook secrets.", 403);
    const { id } = await params;
    const result = await rotateWebhookSecret(admin, companyId, id);
    return NextResponse.json({ data: result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : 500;
    if (!(error instanceof DeveloperAccessError)) console.error("Webhook secret rotation failed", safeError(error, "unknown error"));
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : "The webhook secret could not be rotated." }, { status });
  }
}
