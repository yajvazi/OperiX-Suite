import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { routeError } from "@/lib/api";

export async function GET() {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketAssign);
    const result = await support.client.rpc("support_list_agents", { p_company_id: support.companyId });
    if (result.error) return routeError(result.error);
    const rawAgents = (result.data ?? []) as Array<{ user_id: string; department_ids?: string[] | null; company_name?: string | null; email?: string | null; membership_role?: string | null; signature_url?: string | null }>;
    const data = rawAgents.map((agent) => ({
      id: agent.user_id,
      department_ids: agent.department_ids ?? [],
      profile: {
        company_name: agent.company_name,
        email: agent.email,
        role: agent.membership_role,
        signature_url: agent.signature_url,
      },
    }));
    return Response.json({ data });
  } catch (error) { return routeError(error); }
}
