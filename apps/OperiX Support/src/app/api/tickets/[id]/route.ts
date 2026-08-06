import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getTicket } from "@/lib/support-data";
import { updateTicketSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try { return Response.json(await getTicket(await getSupportContext(SUPPORT_PERMISSIONS.ticketView), (await context.params).id)); }
  catch (error) { return routeError(error); }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketUpdate);
    const ticketId = (await context.params).id;
    const input = await readJson(request, updateTicketSchema);
    const current = await getTicket(support, ticketId);
    const update: Record<string, unknown> = { updated_by: support.user.id };
    if (input.subject !== undefined) update.subject = input.subject;
    if (input.status !== undefined) {
      update.status = input.status;
      if (input.status === "resolved") update.resolved_at = new Date().toISOString();
      if (input.status === "closed") update.closed_at = new Date().toISOString();
      if (!(["resolved", "closed"] as string[]).includes(input.status)) { update.resolved_at = null; update.closed_at = null; }
    }
    if (input.priority !== undefined) update.priority = input.priority;
    if (input.categoryId !== undefined) update.category_id = input.categoryId;
    if (input.departmentId !== undefined) update.department_id = input.departmentId;
    if (input.contactId !== undefined) update.contact_id = input.contactId;
    const result = await support.client.from("support_tickets").update(update).eq("company_id", support.companyId).eq("id", ticketId).is("deleted_at", null).select("id").maybeSingle();
    if (result.error) return routeError(result.error);
    if (!result.data) throw new ApiError(404, "ticket_not_found", "Ticket not found");
    const events: Array<{ event_name: string; payload: Record<string, unknown> }> = [];
    if (input.status !== undefined && input.status !== current.status) events.push({ event_name: "status_changed", payload: { previous_status: current.status, status: input.status } });
    if (input.priority !== undefined && input.priority !== current.priority) events.push({ event_name: "priority_changed", payload: { previous_priority: current.priority, priority: input.priority } });
    if (input.departmentId !== undefined && input.departmentId !== current.department_id) events.push({ event_name: "department_changed", payload: { previous_department_id: current.department_id, department_id: input.departmentId } });
    if (input.categoryId !== undefined && input.categoryId !== current.category_id) events.push({ event_name: "category_changed", payload: { previous_category_id: current.category_id, category_id: input.categoryId } });
    if (input.contactId !== undefined && input.contactId !== current.contact_id) events.push({ event_name: "contact_changed", payload: { previous_contact_id: current.contact_id, contact_id: input.contactId } });
    if (events.length) {
      const eventResult = await support.client.from("support_events").insert(events.map((event) => ({ company_id: support.companyId, ticket_id: ticketId, event_name: event.event_name, payload: event.payload, actor_user_id: support.user.id })));
      if (eventResult.error) return routeError(eventResult.error);
    }
    return Response.json(await getTicket(support, ticketId));
  } catch (error) { return routeError(error); }
}
