import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { routeError } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.emailManage);
    const result = await support.client.from("support_email_deliveries").update({ status: "queued", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("company_id", support.companyId).eq("id", (await context.params).id).in("status", ["failed", "bounced", "retrying"]).select("id").maybeSingle();
    if (result.error) return routeError(result.error);
    if (!result.data) return Response.json({ error: { code: "delivery_not_resendable", message: "Delivery is not available for resend" } }, { status: 409 });
    return Response.json({ data: result.data });
  } catch (error) { return routeError(error); }
}
