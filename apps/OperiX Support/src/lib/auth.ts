import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { ApiError } from "./errors";
import { createClient } from "./supabase/server";

export const SUPPORT_PERMISSIONS = {
  dashboardView: "support.dashboard.view",
  ticketView: "support.ticket.view",
  ticketCreate: "support.ticket.create",
  ticketUpdate: "support.ticket.update",
  ticketAssign: "support.ticket.assign",
  ticketReply: "support.ticket.reply",
  ticketInternalNote: "support.ticket.internal_note",
  contactView: "support.contact.view",
  contactManage: "support.contact.manage",
  departmentManage: "support.department.manage",
  categoryManage: "support.category.manage",
  savedReplyManage: "support.saved_reply.manage",
  attachmentManage: "support.attachment.manage",
  emailManage: "support.email.manage",
} as const;

export type SupportPermission = (typeof SUPPORT_PERMISSIONS)[keyof typeof SUPPORT_PERMISSIONS];

export type SupportContext = {
  client: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  user: User;
  companyId: string;
  profile: Record<string, unknown>;
};

export async function getSupportContext(permission: SupportPermission): Promise<SupportContext> {
  const client = await createClient();
  if (!client) throw new ApiError(503, "supabase_not_configured", "Support is not connected to Supabase");
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw new ApiError(401, "unauthorized", "Authentication is required");

  const { data: profile, error: profileError } = await client.from("profiles").select("id, company_id, active_company_id, email, company_name, role, signature_url").eq("id", user.id).maybeSingle();
  if (profileError) throw new ApiError(500, "profile_lookup_failed", profileError.message);
  const typedProfile = (profile ?? {}) as Record<string, unknown>;
  const requestedCompanyId = (await headers()).get("x-company-id");
  const companyId = requestedCompanyId ?? String(typedProfile.active_company_id ?? typedProfile.company_id ?? "");
  if (!companyId) throw new ApiError(403, "company_required", "Select an OperiX company before using Support");

  const { data: allowed, error: permissionError } = await client.rpc("support_has_permission", { p_company_id: companyId, p_permission: permission });
  if (permissionError || allowed !== true) throw new ApiError(403, "forbidden", "You do not have permission to perform this action");
  return { client, user, companyId, profile: typedProfile };
}

export async function getOptionalSupportContext(permission: SupportPermission): Promise<SupportContext | null> {
  try {
    return await getSupportContext(permission);
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 503].includes(error.status)) return null;
    throw error;
  }
}
