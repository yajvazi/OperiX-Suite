import { hasWorkspacePermission, resolveWorkspace, type WorkspaceScope } from "@invoice-monorepo/api/workspace";
import { INVOICE_SCOPES, BOOKING_SCOPES } from "@invoice-monorepo/public-api/contracts";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export class DeveloperAccessError extends Error {
  readonly status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "DeveloperAccessError";
    this.status = status;
  }
}

export async function developerContext() {
  const client = await createClient();
  if (!client) throw new DeveloperAccessError("Developer settings are not configured.", 503);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new DeveloperAccessError("Authentication is required.", 401);
  let workspace: WorkspaceScope;
  try {
    workspace = await resolveWorkspace(client, user.id, { includeSensitiveFields: false });
  } catch {
    throw new DeveloperAccessError("The active workspace could not be resolved.", 403);
  }
  if (!hasWorkspacePermission(workspace, "settings.integrations")) throw new DeveloperAccessError("Developer settings require workspace administrator permission.", 403);
  const admin = createAdminClient();
  if (!admin) throw new DeveloperAccessError("Developer settings storage is not configured.", 503);
  return { client, admin, user, workspace, companyId: workspace.companyId };
}

export async function developerEntitlement(client: Awaited<ReturnType<typeof createClient>>, companyId: string) {
  if (!client) throw new DeveloperAccessError("Developer settings are not configured.", 503);
  const { data, error } = await client.rpc("api_entitlement_summary", { p_company_id: companyId });
  if (error) throw new DeveloperAccessError("API entitlement status is temporarily unavailable.", 502);
  return (data || {}) as {
    api_addon?: boolean;
    invoice?: boolean;
    booking?: boolean;
    status?: string;
    period_start?: string | null;
    period_end?: string | null;
    grace_period_ends_at?: string | null;
    included_requests?: number;
    automatic_overage_charging?: boolean;
    overage_ready?: boolean;
  };
}

export const developerScopes = [...INVOICE_SCOPES, ...BOOKING_SCOPES] as const;

export function safeError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
