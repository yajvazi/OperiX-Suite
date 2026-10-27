import { NextResponse } from "next/server";
import { z } from "zod";
import { API_ENVIRONMENTS } from "@invoice-monorepo/public-api/contracts";
import { createWebhookEndpoint, PUBLIC_WEBHOOK_EVENTS } from "@invoice-monorepo/public-api/webhooks";
import { developerContext, developerEntitlement, DeveloperAccessError, safeError } from "@/lib/developers";

export const runtime = "nodejs";

const eventValues = [...PUBLIC_WEBHOOK_EVENTS] as [string, ...string[]];
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2048),
  environment: z.enum(API_ENVIRONMENTS),
  events: z.array(z.enum(eventValues as [typeof eventValues[number], ...typeof eventValues[number][]])).min(1).max(PUBLIC_WEBHOOK_EVENTS.length),
}).strict();

export async function POST(request: Request) {
  try {
    const { admin, client, user, companyId } = await developerContext();
    const entitlement = await developerEntitlement(client, companyId);
    if (entitlement.api_addon !== true) throw new DeveloperAccessError("An active OperiX API Add-on is required to create webhook endpoints.", 403);
    const input = createSchema.parse(await request.json());
    const result = await createWebhookEndpoint(admin, { companyId, createdBy: user.id, name: input.name, url: input.url, environment: input.environment, events: input.events });
    return NextResponse.json({ data: result }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DeveloperAccessError ? error.status : error instanceof z.ZodError ? 422 : 500;
    if (!(error instanceof DeveloperAccessError) && !(error instanceof z.ZodError)) console.error("Webhook endpoint creation failed", safeError(error, "unknown error"));
    return NextResponse.json({ error: error instanceof DeveloperAccessError ? error.message : error instanceof z.ZodError ? "The webhook endpoint details are invalid." : "The webhook endpoint could not be created." }, { status });
  }
}
