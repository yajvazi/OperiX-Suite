import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { slugify } from "@/lib/text";
import { categorySchema } from "@/lib/validation";

export async function GET() {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketView);
    const result = await support.client.from("support_categories").select("id,parent_id,name,slug,description,color,sort_order,is_active,created_at").eq("company_id", support.companyId).is("deleted_at", null).order("sort_order").order("name");
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data ?? [] });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.categoryManage);
    const input = await readJson(request, categorySchema);
    const result = await support.client.from("support_categories").insert({ company_id: support.companyId, parent_id: input.parentId ?? null, name: input.name, slug: slugify(input.name), description: input.description ?? null, color: input.color, sort_order: input.sortOrder, created_by: support.user.id, updated_by: support.user.id }).select("*").single();
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data }, { status: 201 });
  } catch (error) { return routeError(error); }
}
