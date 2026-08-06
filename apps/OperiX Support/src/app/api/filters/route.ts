import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { savedFilterSchema } from "@/lib/validation";

export async function GET() {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketView);
    const result = await support.client.from("support_saved_filters").select("id,name,filters,is_shared,created_by,created_at,updated_at").eq("company_id", support.companyId).or(`is_shared.eq.true,created_by.eq.${support.user.id}`).order("name");
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data ?? [] });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketView);
    const input = await readJson(request, savedFilterSchema);
    const result = await support.client.from("support_saved_filters").insert({ company_id: support.companyId, name: input.name, filters: input.filters, is_shared: input.isShared, created_by: support.user.id }).select("*").single();
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data }, { status: 201 });
  } catch (error) { return routeError(error); }
}
