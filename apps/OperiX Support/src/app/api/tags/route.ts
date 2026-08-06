import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { slugify } from "@/lib/text";
import { tagSchema } from "@/lib/validation";

export async function GET() {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketView);
    const result = await support.client.from("support_tags").select("id,name,slug,color,created_at").eq("company_id", support.companyId).is("deleted_at", null).order("name");
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data ?? [] });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.categoryManage);
    const input = await readJson(request, tagSchema);
    const result = await support.client.from("support_tags").insert({ company_id: support.companyId, name: input.name, slug: slugify(input.name), color: input.color, created_by: support.user.id, updated_by: support.user.id }).select("*").single();
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data }, { status: 201 });
  } catch (error) { return routeError(error); }
}
