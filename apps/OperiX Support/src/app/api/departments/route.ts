import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { departmentSchema } from "@/lib/validation";

export async function GET() {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketView);
    const result = await support.client.from("support_departments").select("id,code,name,description,is_active,created_at").eq("company_id", support.companyId).is("deleted_at", null).order("name");
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data ?? [] });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.departmentManage);
    const input = await readJson(request, departmentSchema);
    const result = await support.client.from("support_departments").insert({ company_id: support.companyId, code: input.code.toLowerCase(), name: input.name, description: input.description ?? null, created_by: support.user.id, updated_by: support.user.id }).select("*").single();
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data }, { status: 201 });
  } catch (error) { return routeError(error); }
}
