import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { bulkAssignmentSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketAssign);
    const input = await readJson(request, bulkAssignmentSchema);
    const result = await support.client.rpc("support_bulk_assign_tickets", {
      p_company_id: support.companyId,
      p_ticket_ids: input.ticketIds,
      p_agent_id: input.agentId,
      p_department_id: input.departmentId ?? null,
    });
    if (result.error) return routeError(result.error);
    return Response.json({ data: { assignedCount: Number(result.data ?? 0) } });
  } catch (error) { return routeError(error); }
}
