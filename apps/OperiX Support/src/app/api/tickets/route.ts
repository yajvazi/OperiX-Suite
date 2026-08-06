import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { getTicket, listTickets } from "@/lib/support-data";
import { createTicketSchema, searchSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const filters = searchSchema.parse(params);
    return Response.json(await listTickets(await getSupportContext(SUPPORT_PERMISSIONS.ticketView), filters));
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getSupportContext(SUPPORT_PERMISSIONS.ticketCreate);
    const input = await readJson(request, createTicketSchema);
    const result = await context.client.rpc("support_create_ticket", {
      p_company_id: context.companyId,
      p_subject: input.subject,
      p_description: input.description,
      p_priority: input.priority,
      p_category_id: input.categoryId ?? null,
      p_department_id: input.departmentId ?? null,
      p_contact_id: input.contactId ?? null,
      p_mailbox_id: input.mailboxId ?? null,
      p_source_application: input.sourceApplication,
    });
    if (result.error) return routeError(result.error);
    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!created?.ticket_id) return Response.json({ error: { code: "ticket_creation_failed", message: "The database did not return the created ticket" } }, { status: 500 });
    if (input.tagIds.length) {
      const tagResult = await context.client.from("support_ticket_tags").insert(input.tagIds.map((tagId) => ({ company_id: context.companyId, ticket_id: created.ticket_id, tag_id: tagId, created_by: context.user.id })));
      if (tagResult.error) return routeError(tagResult.error);
    }
    return Response.json(await getTicket(context, created.ticket_id), { status: 201 });
  } catch (error) { return routeError(error); }
}
