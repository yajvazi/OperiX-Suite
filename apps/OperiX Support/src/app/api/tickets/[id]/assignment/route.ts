import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { getTicket } from "@/lib/support-data";
import { assignmentSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketAssign);
    const ticketId = (await context.params).id;
    const input = await readJson(request, assignmentSchema);
    const result = await support.client.rpc("support_assign_ticket", { p_company_id: support.companyId, p_ticket_id: ticketId, p_agent_id: input.agentId, p_department_id: input.departmentId ?? null });
    if (result.error) return routeError(result.error);
    return Response.json(await getTicket(support, ticketId));
  } catch (error) { return routeError(error); }
}
