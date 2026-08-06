import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { contactSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.contactView);
    const result = await support.client.from("support_contacts").select("*").eq("company_id", support.companyId).eq("id", (await context.params).id).is("deleted_at", null).maybeSingle();
    if (result.error) return routeError(result.error);
    if (!result.data) return Response.json({ error: { code: "contact_not_found", message: "Contact not found" } }, { status: 404 });
    const tickets = await support.client.from("support_tickets").select("id,ticket_number,subject,status,priority").eq("company_id", support.companyId).eq("contact_id", (await context.params).id).is("deleted_at", null).order("updated_at", { ascending: false }).limit(100);
    if (tickets.error) return routeError(tickets.error);
    return Response.json({ data: result.data, tickets: tickets.data ?? [] });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.contactManage);
    const id = (await context.params).id;
    const input = await readJson(request, contactSchema.partial());
    const update: Record<string, unknown> = { updated_by: support.user.id };
    if (input.displayName !== undefined) update.display_name = input.displayName;
    if (input.email !== undefined) update.email = input.email;
    if (input.phone !== undefined) update.phone = input.phone;
    if (input.organizationName !== undefined) update.organization_name = input.organizationName;
    if (input.contactKind !== undefined) update.contact_kind = input.contactKind;
    if (input.notes !== undefined) update.notes = input.notes;
    if (input.linkedEntityType !== undefined) update.linked_entity_type = input.linkedEntityType;
    if (input.linkedEntityId !== undefined) update.linked_entity_id = input.linkedEntityId;
    if (input.linkedProfileId !== undefined) update.linked_profile_id = input.linkedProfileId;
    const result = await support.client.from("support_contacts").update(update).eq("company_id", support.companyId).eq("id", id).is("deleted_at", null).select("*").maybeSingle();
    if (result.error) return routeError(result.error);
    if (!result.data) return Response.json({ error: { code: "contact_not_found", message: "Contact not found" } }, { status: 404 });
    return Response.json({ data: result.data });
  } catch (error) { return routeError(error); }
}
