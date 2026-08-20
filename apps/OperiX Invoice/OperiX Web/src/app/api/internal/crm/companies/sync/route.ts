import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { readCrmFlags } from "@/lib/crm/flags";
import { linkTwentyCompanyToInvoiceCustomer } from "@/lib/crm/customer-linking";
import { createTwentyClient, twentyLinkFieldName } from "@/lib/crm/twenty-client";
import { verifyInternalApiKey } from "@/lib/crm/security";

export const runtime = "nodejs";

const payloadSchema = z.object({
  organizationId: z.string().uuid(),
  company: z.object({ id: z.string().min(1) }).passthrough(),
  allowCreate: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  if (!verifyInternalApiKey(request.headers.get("x-operix-internal-api-key"), process.env.OPERIX_INTERNAL_API_KEY)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const flags = readCrmFlags();
  if (!flags.enabled) return NextResponse.json({ error: "OperiX CRM integration is disabled." }, { status: 503 });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid company sync payload." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Integration storage is not configured." }, { status: 503 });

  const result = await linkTwentyCompanyToInvoiceCustomer({
    db: admin,
    organizationId: parsed.data.organizationId,
    company: parsed.data.company,
    allowCreate: parsed.data.allowCreate && flags.syncCustomers,
  });
  if (result.status === "linked" && result.targetEntityId) {
    const twenty = createTwentyClient();
    if (twenty) await twenty.updateCompany(parsed.data.company.id, { [twentyLinkFieldName()]: result.targetEntityId });
  }
  return NextResponse.json(result, { status: result.status === "failed" ? 422 : 200 });
}
