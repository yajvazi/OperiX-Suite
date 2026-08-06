import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { contactSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.contactView);
    const q = new URL(request.url).searchParams.get("q")?.trim();
    let query = support.client.from("support_contacts").select("id,display_name,email,phone,organization_name,contact_kind,linked_entity_type,linked_entity_id,notes,created_at,updated_at").eq("company_id", support.companyId).is("deleted_at", null).order("display_name").limit(100);
    if (q) query = query.or(`display_name.ilike.%${q.replace(/[,%()]/g, " ")}%,email.ilike.%${q.replace(/[,%()]/g, " ")}%`);
    const result = await query;
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data ?? [] });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.contactManage);
    const input = await readJson(request, contactSchema);
    const result = await support.client.from("support_contacts").insert({ company_id: support.companyId, display_name: input.displayName, email: input.email ?? null, phone: input.phone ?? null, organization_name: input.organizationName ?? null, contact_kind: input.contactKind, notes: input.notes ?? null, linked_entity_type: input.linkedEntityType ?? null, linked_entity_id: input.linkedEntityId ?? null, linked_profile_id: input.linkedProfileId ?? null, created_by: support.user.id, updated_by: support.user.id }).select("*").single();
    if (result.error) return routeError(result.error);
    return Response.json({ data: result.data }, { status: 201 });
  } catch (error) { return routeError(error); }
}
