import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { getTicket } from "@/lib/support-data";
import { messageSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const ticketId = (await context.params).id;
    const input = await readJson(request, messageSchema);
    const support = await getSupportContext(input.visibility === "internal" ? SUPPORT_PERMISSIONS.ticketInternalNote : SUPPORT_PERMISSIONS.ticketReply);
    const result = await support.client.rpc("support_add_message", { p_company_id: support.companyId, p_ticket_id: ticketId, p_body_text: input.body, p_visibility: input.visibility, p_source: "agent" });
    if (result.error) return routeError(result.error);
    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!created?.message_id) return Response.json({ error: { code: "message_creation_failed", message: "The database did not return the created message" } }, { status: 500 });
    if (input.attachmentIds.length) {
      const attachmentResult = await support.client.from("support_attachments").update({ message_id: created.message_id }).eq("company_id", support.companyId).eq("ticket_id", ticketId).in("id", input.attachmentIds);
      if (attachmentResult.error) return routeError(attachmentResult.error);
    }
    if (input.visibility === "public" && input.sendEmail) {
      const ticketResult = await support.client.from("support_tickets").select("id,ticket_number,subject,contact_id,mailbox_id,department_id").eq("company_id", support.companyId).eq("id", ticketId).maybeSingle();
      if (ticketResult.error) return routeError(ticketResult.error);
      if (ticketResult.data?.contact_id) {
        const [contact, mailbox] = await Promise.all([
          support.client.from("support_contacts").select("email").eq("company_id", support.companyId).eq("id", ticketResult.data.contact_id).maybeSingle(),
          ticketResult.data.mailbox_id ? support.client.from("support_mailboxes").select("id").eq("company_id", support.companyId).eq("id", ticketResult.data.mailbox_id).maybeSingle() : support.client.from("support_mailboxes").select("id").eq("company_id", support.companyId).eq("is_active", true).is("deleted_at", null).order("created_at").limit(1).maybeSingle(),
        ]);
        if (contact.error || mailbox.error) return routeError(contact.error ?? mailbox.error);
        if (contact.data?.email && mailbox.data?.id) {
          const delivery = await support.client.from("support_email_deliveries").insert({ company_id: support.companyId, mailbox_id: mailbox.data.id, message_id: created.message_id, ticket_id: ticketId, recipient: contact.data.email.toLowerCase(), subject: `Re: ${ticketResult.data.ticket_number} ${ticketResult.data.subject}`, delivery_type: "message", idempotency_key: `reply:${created.message_id}` });
          if (delivery.error && delivery.error.code !== "23505") return routeError(delivery.error);
          if (!delivery.error) {
            const eventResult = await support.client.from("support_events").insert({ company_id: support.companyId, ticket_id: ticketId, event_name: "email_queued", payload: { message_id: created.message_id, recipient: contact.data.email.toLowerCase(), delivery_type: "message" }, actor_user_id: support.user.id });
            if (eventResult.error) return routeError(eventResult.error);
          }
        }
      }
    }
    return Response.json(await getTicket(support, ticketId), { status: 201 });
  } catch (error) { return routeError(error); }
}
