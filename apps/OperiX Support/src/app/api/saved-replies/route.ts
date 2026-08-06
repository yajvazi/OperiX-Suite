import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { getSupportLookups } from "@/lib/support-data";
import { savedReplySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketView);
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 160);
    let result = support.client.from("support_saved_replies").select("id,name,body_text,body_html,category_id").eq("company_id", support.companyId).eq("is_active", true).is("deleted_at", null).order("name");
    if (query) result = result.or(`name.ilike.%${query.replace(/[,%()]/g, " ")}%,body_text.ilike.%${query.replace(/[,%()]/g, " ")}%`);
    const response = await result;
    if (response.error) return routeError(response.error);
    return Response.json({ data: response.data ?? [] });
  }
  catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.savedReplyManage);
    const input = await readJson(request, savedReplySchema);
    const result = await support.client.from("support_saved_replies").insert({ company_id: support.companyId, name: input.name, body_text: input.bodyText, body_html: input.bodyHtml ?? null, category_id: input.categoryId ?? null, created_by: support.user.id, updated_by: support.user.id }).select("*").single();
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data }, { status: 201 });
  } catch (error) { return routeError(error); }
}
