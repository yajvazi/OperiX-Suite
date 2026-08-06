import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { routeError } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.emailManage);
    const status = new URL(request.url).searchParams.get("status");
    let query = support.client.from("support_email_deliveries").select("id,ticket_id,recipient,subject,delivery_type,status,attempts,last_error,queued_at,sent_at,updated_at").eq("company_id", support.companyId).order("queued_at", { ascending: false }).limit(100);
    if (status) query = query.eq("status", status);
    const result = await query;
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data ?? [] });
  } catch (error) { return routeError(error); }
}
