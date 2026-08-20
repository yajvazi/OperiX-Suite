import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { registryFallback } from "./control-registry";
import type {
  AppEntitlementRow,
  AppRegistryRow,
  AuditRow,
  ApiKeyRow,
  BillingOverview,
  ControlPermission,
  DomainRow,
  GroupRow,
  GroupAccessRow,
  IntegrationRow,
  InvitationRow,
  MemberSecurityRow,
  MemberAppAccessRow,
  MemberRow,
  NotificationRow,
  PermissionRow,
  RoleRow,
  SecuritySummary,
  SearchResult,
  StorageSummary,
  FeatureFlagRow,
  UsageRow,
  WebhookDeliveryRow,
  WebhookRow,
  Workspace,
  WorkspaceCompany,
  WorkspaceProfile,
} from "./control-types";

type Client = SupabaseClient;

const uuidSchema = z.string().uuid();
const codeSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]{0,80}$/i);
const emailSchema = z.string().trim().email().max(320);

function requireUuid(value: string, label: string) {
  const result = uuidSchema.safeParse(value);
  if (!result.success) throw new Error(`${label} is invalid.`);
  return result.data;
}

function requireCode(value: string, label: string) {
  const result = codeSchema.safeParse(value);
  if (!result.success) throw new Error(`${label} is invalid.`);
  return result.data;
}

async function assertControlPermission(client: Client, companyId: string, permission: ControlPermission) {
  const safeCompanyId = requireUuid(companyId, "Organization");
  const { data, error } = await client.rpc("control_has_permission", { p_company_id: safeCompanyId, p_permission: permission });
  if (error) throw error;
  if (data !== true) throw new Error(`Missing ${permission} permission.`);
}

export function companyName(company: WorkspaceCompany | null | undefined) {
  return company?.company_name || company?.name || "OperiX organization";
}

export async function resolveControlWorkspace(client: Client): Promise<Workspace> {
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) {
    return { user: null, profile: { id: "" }, company: null, companies: [], companyId: null, permissions: new Set(), accessChecked: false };
  }

  const [{ data: profileData, error: profileError }, { data: companiesData, error: companiesError }] = await Promise.all([
    client.from("profiles").select("id,first_name,last_name,email,phone,company_id,active_company_id,role,company_name").eq("id", user.id).maybeSingle(),
    client.from("companies").select("id,company_name,name,parent_company_id,archived_at").order("company_name"),
  ]);

  if (profileError) throw profileError;
  if (companiesError) throw companiesError;
  const profile = (profileData || { id: user.id, email: user.email }) as WorkspaceProfile;
  const companies = ((companiesData || []) as WorkspaceCompany[]).filter((company) => !company.archived_at);
  const companyId = profile.active_company_id || profile.company_id || null;
  let company = companies.find((candidate) => candidate.id === companyId) || null;
  const permissions = new Set<ControlPermission>();

  if (companyId) {
    const { data: access, error: accessError } = await client.rpc("control_has_permission", { p_company_id: companyId, p_permission: "control.access" });
    if (accessError) throw accessError;
    if (access !== true) throw new Error("Control access is restricted for this organization.");
    if (access === true) permissions.add("control.access");
    const permissionNames: ControlPermission[] = [
      "organization.read", "organization.manage", "users.read", "users.manage", "teams.read", "teams.manage",
      "roles.read", "roles.manage", "apps.read", "apps.manage", "integrations.read", "integrations.manage",
      "billing.read", "billing.manage", "usage.read", "security.read", "security.manage", "audit.read",
      "settings.read", "settings.manage", "api.read", "api.manage", "data.read", "status.read",
    ];
    const permissionResults = await Promise.all(permissionNames.map((permission) => client.rpc("control_has_permission", { p_company_id: companyId, p_permission: permission })));
    const permissionError = permissionResults.find((result) => result.error)?.error;
    if (permissionError) throw permissionError;
    permissionResults.forEach((result, index) => { if (result.data === true) permissions.add(permissionNames[index]); });

    if (permissions.has("organization.read") || permissions.has("organization.manage")) {
      const { data: detail, error: detailError } = await client.from("companies").select("id,company_name,name,parent_company_id,email,phone,address,website,tax_id,logo_url,primary_color,default_language,currency,archived_at").eq("id", companyId).maybeSingle();
      if (detailError) throw detailError;
      company = (detail as WorkspaceCompany | null) || company;
    }

    if (permissions.has("billing.read") || permissions.has("integrations.read")) {
      const { data: billingProfile, error: billingError } = await client.from("profiles").select("stripe_account_id,stripe_connected_at,stripe_livemode").eq("id", user.id).maybeSingle();
      if (billingError) throw billingError;
      Object.assign(profile, billingProfile || {});
    }
  }

  return {
    user: { id: user.id, email: user.email },
    profile,
    company,
    companies,
    companyId,
    permissions,
    accessChecked: Boolean(companyId),
  };
}

export async function listCompanyMembers(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_list_company_members", { p_company_id: companyId });
  if (error) throw error;
  return ((data || []) as MemberRow[]).filter((member) => member.status !== "revoked");
}

export async function listCompanyInvitations(client: Client, companyId: string) {
  const { data, error } = await client.rpc("list_company_invitations", { p_company_id: companyId });
  if (error) throw error;
  return (data || []) as InvitationRow[];
}

export async function listAppRegistry(client: Client) {
  const { data, error } = await client.from("operix_apps").select("app_key,display_name,description,route,icon_key,available,subscription_requirement,sort_order").eq("available", true).order("sort_order");
  if (error) return { rows: registryFallback as AppRegistryRow[], foundationReady: false, error };
  return { rows: (data || []) as AppRegistryRow[], foundationReady: true, error: null };
}

export async function listAppEntitlements(client: Client, companyId: string) {
  const { data, error } = await client.from("company_app_entitlements").select("company_id,app_key,enabled,plan,enabled_at,disabled_at,settings").eq("company_id", companyId);
  return { rows: (data || []) as AppEntitlementRow[], error };
}

export async function listMemberAppAccess(client: Client, companyId: string) {
  const { data, error } = await client.from("membership_app_access").select("membership_id,app_key,enabled,granted_at,membership:memberships!inner(company_id)").eq("membership.company_id", companyId);
  return { rows: (data || []).map((row) => ({ membership_id: row.membership_id, app_key: row.app_key, enabled: row.enabled, granted_at: row.granted_at })) as MemberAppAccessRow[], error };
}

export async function listRoles(client: Client, companyId: string) {
  const safeCompanyId = requireUuid(companyId, "Organization");
  const { data, error } = await client.from("app_roles").select("id,company_id,code,name,description,is_system").or(`company_id.is.null,company_id.eq.${safeCompanyId}`).order("is_system", { ascending: false }).order("name");
  if (error) throw error;
  return (data || []).filter((role) => ["super_administrator", "company_administrator", "manager", "employee"].includes(role.code)) as RoleRow[];
}

export async function listPermissions(client: Client) {
  const { data, error } = await client.from("app_permissions").select("code,name,category,description,is_sensitive").order("category").order("name");
  if (error) throw error;
  return (data || []) as PermissionRow[];
}

export async function listRolePermissions(client: Client, roleIds: string[]) {
  if (!roleIds.length) return [] as Array<{ role_id: string; permission_code: string }>;
  const { data, error } = await client.from("app_role_permissions").select("role_id,permission_code").in("role_id", roleIds);
  if (error) throw error;
  return (data || []) as Array<{ role_id: string; permission_code: string }>;
}

export async function listAuditEvents(client: Client, companyId: string, limit = 40) {
  const { data, error } = await client.rpc("control_list_audit_events", { p_company_id: requireUuid(companyId, "Organization"), p_limit: Math.min(Math.max(limit, 1), 200) });
  if (error) throw error;
  return (data || []) as AuditRow[];
}

export async function updateCompanyProfile(client: Client, input: { companyId: string; companyName: string; email: string; phone: string; address: string; website: string; taxId: string }) {
  await assertControlPermission(client, input.companyId, "organization.manage");
  const { data, error } = await client.rpc("update_company_profile", {
    p_company_id: input.companyId,
    p_company_name: input.companyName,
    p_email: input.email,
    p_phone: input.phone,
    p_address: input.address,
    p_website: input.website,
    p_tax_id: input.taxId,
  });
  if (error) throw error;
  return data;
}

export async function updateCompanyPreferences(client: Client, companyId: string, input: { default_language: string; currency: string; primary_color: string }) {
  await assertControlPermission(client, companyId, "organization.manage");
  const preferences = z.object({ default_language: z.enum(["en", "sq"]), currency: z.string().trim().regex(/^[A-Z]{3}$/), primary_color: z.string().regex(/^#[0-9a-f]{6}$/i) }).parse(input);
  const { data, error } = await client.from("companies").update(preferences).eq("id", requireUuid(companyId, "Organization")).select("id,default_language,currency,primary_color").single();
  if (error) throw error;
  return data;
}

export async function updateCompanyBranding(client: Client, companyId: string, input: { logoUrl: string; primaryColor: string }) {
  await assertControlPermission(client, companyId, "organization.manage");
  const branding = z.object({ logo_url: z.union([z.string().url(), z.literal("")]), primary_color: z.string().regex(/^#[0-9a-f]{6}$/i) }).parse({ logo_url: input.logoUrl.trim(), primary_color: input.primaryColor });
  const { data, error } = await client.from("companies").update(branding).eq("id", requireUuid(companyId, "Organization")).select("id,logo_url,primary_color").single();
  if (error) throw error;
  return data;
}

export async function createInvitation(client: Client, companyId: string, email: string, roleCode: string) {
  await assertControlPermission(client, companyId, "users.manage");
  const { data, error } = await client.rpc("control_create_company_invitation", { p_company_id: requireUuid(companyId, "Organization"), p_email: emailSchema.parse(email), p_role_code: requireCode(roleCode, "Role") });
  if (error) throw error;
  return data as { id: string; email: string; role_code: string; expires_at: string };
}

export async function revokeInvitation(client: Client, companyId: string, invitationId: string) {
  await assertControlPermission(client, companyId, "users.manage");
  const { data, error } = await client.rpc("control_revoke_company_invitation", { p_company_id: requireUuid(companyId, "Organization"), p_invitation_id: requireUuid(invitationId, "Invitation") });
  if (error) throw error;
  return data;
}

export async function updateMemberRole(client: Client, companyId: string, membershipId: string, roleCode: string) {
  await assertControlPermission(client, companyId, "roles.manage");
  const { data, error } = await client.rpc("set_company_member_role", { p_membership_id: requireUuid(membershipId, "Membership"), p_role_code: requireCode(roleCode, "Role") });
  if (error) throw error;
  return data;
}

export async function revokeMember(client: Client, companyId: string, membershipId: string) {
  await assertControlPermission(client, companyId, "users.manage");
  const { data, error } = await client.rpc("control_remove_company_member", { p_company_id: requireUuid(companyId, "Organization"), p_membership_id: requireUuid(membershipId, "Membership") });
  if (error) throw error;
  return data;
}

export async function setMemberStatus(client: Client, companyId: string, membershipId: string, status: "active" | "suspended") {
  await assertControlPermission(client, companyId, "users.manage");
  const { data, error } = await client.rpc("control_set_member_status", {
    p_company_id: requireUuid(companyId, "Organization"),
    p_membership_id: requireUuid(membershipId, "Membership"),
    p_status: status,
  });
  if (error) throw error;
  return data;
}

export async function setAppEntitlement(client: Client, companyId: string, appKey: string, enabled: boolean) {
  return setAppEntitlementViaControl(client, companyId, appKey, enabled);
}

export async function setMemberAppAccess(client: Client, companyId: string, membershipId: string, appKey: string, enabled: boolean) {
  return setMemberAppAccessViaControl(client, companyId, membershipId, appKey, enabled);
}

export async function createCustomRole(client: Client, companyId: string, name: string, description: string, permissionCodes: string[]) {
  await assertControlPermission(client, companyId, "roles.manage");
  const safeName = z.string().trim().min(1).max(120).parse(name);
  const safeDescription = z.string().trim().max(500).parse(description || "");
  const safePermissionCodes = permissionCodes.map((permission) => requireCode(permission, "Permission"));
  const code = safeName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  if (!code) throw new Error("Enter a role name.");
  const { data: role, error: roleError } = await client.from("app_roles").insert({ company_id: requireUuid(companyId, "Organization"), code, name: safeName, description: safeDescription || null, is_system: false }).select("id,company_id,code,name,description,is_system").single();
  if (roleError) throw roleError;
  if (permissionCodes.length) {
    const { error: permissionsError } = await client.from("app_role_permissions").insert(safePermissionCodes.map((permission_code) => ({ role_id: role.id, permission_code })));
    if (permissionsError) throw permissionsError;
  }
  return role as RoleRow;
}

export async function setRolePermissions(client: Client, companyId: string, roleId: string, permissionCodes: string[]) {
  const { error } = await client.rpc("control_set_role_permissions", { p_company_id: requireUuid(companyId, "Organization"), p_role_id: requireUuid(roleId, "Role"), p_permissions: permissionCodes.map((permission) => requireCode(permission, "Permission")) });
  if (error) throw error;
}

export async function deleteCustomRole(client: Client, companyId: string, roleId: string) {
  const { error } = await client.rpc("control_delete_custom_role", { p_company_id: requireUuid(companyId, "Organization"), p_role_id: requireUuid(roleId, "Role") });
  if (error) throw error;
}

export async function signOut(client: Client) {
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw error;
}

export async function currentUser(client: Client): Promise<User | null> {
  const { data } = await client.auth.getUser();
  return data.user;
}

export async function setAppEntitlementViaControl(client: Client, companyId: string, appKey: string, enabled: boolean) {
  const { data, error } = await client.rpc("control_set_app_entitlement", { p_company_id: requireUuid(companyId, "Organization"), p_app_key: requireCode(appKey, "Application"), p_enabled: enabled });
  if (error) throw error;
  return data as AppEntitlementRow;
}

export async function setMemberAppAccessViaControl(client: Client, companyId: string, membershipId: string, appKey: string, enabled: boolean) {
  const { data, error } = await client.rpc("control_set_member_app_access", { p_company_id: requireUuid(companyId, "Organization"), p_membership_id: requireUuid(membershipId, "Membership"), p_app_key: requireCode(appKey, "Application"), p_enabled: enabled });
  if (error) throw error;
  return data as MemberAppAccessRow;
}

export async function listGroups(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_list_groups", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return (data || []) as GroupRow[];
}

export async function createGroup(client: Client, companyId: string, name: string, description: string) {
  const { data, error } = await client.rpc("control_create_group", { p_company_id: requireUuid(companyId, "Organization"), p_name: z.string().trim().min(1).max(120).parse(name), p_description: z.string().trim().max(500).parse(description || "") });
  if (error) throw error;
  return data as GroupRow;
}

export async function deleteGroup(client: Client, companyId: string, groupId: string) {
  const { error } = await client.rpc("control_delete_group", { p_company_id: requireUuid(companyId, "Organization"), p_group_id: requireUuid(groupId, "Group") });
  if (error) throw error;
}

export async function setGroupMember(client: Client, companyId: string, groupId: string, membershipId: string, enabled: boolean) {
  const { error } = await client.rpc("control_set_group_member", { p_company_id: requireUuid(companyId, "Organization"), p_group_id: requireUuid(groupId, "Group"), p_membership_id: requireUuid(membershipId, "Membership"), p_enabled: enabled });
  if (error) throw error;
}

export async function setGroupAppAccess(client: Client, companyId: string, groupId: string, appKey: string, enabled: boolean) {
  const { error } = await client.rpc("control_set_group_app_access", { p_company_id: requireUuid(companyId, "Organization"), p_group_id: requireUuid(groupId, "Group"), p_app_key: requireCode(appKey, "Application"), p_enabled: enabled });
  if (error) throw error;
}

export async function listGroupAccess(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_list_group_access", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return (data || []) as GroupAccessRow[];
}

export async function listNotifications(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_list_notifications", { p_company_id: requireUuid(companyId, "Organization"), p_limit: 100 });
  if (error) throw error;
  return (data || []) as NotificationRow[];
}

export async function searchControl(client: Client, companyId: string, query: string) {
  const { data, error } = await client.rpc("control_search", { p_company_id: requireUuid(companyId, "Organization"), p_query: z.string().trim().max(120).parse(query) });
  if (error) throw error;
  return (data || []) as SearchResult[];
}

export async function markNotificationRead(client: Client, companyId: string, eventId: string) {
  const { error } = await client.rpc("control_mark_notification_read", { p_company_id: requireUuid(companyId, "Organization"), p_event_id: requireUuid(eventId, "Notification") });
  if (error) throw error;
}

export async function markAllNotificationsRead(client: Client, companyId: string) {
  const { error } = await client.rpc("control_mark_all_notifications_read", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
}

export async function getSecuritySummary(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_security_summary", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return ((data || [])[0] || null) as SecuritySummary | null;
}

export async function listMemberSecurity(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_list_member_security", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return (data || []) as MemberSecurityRow[];
}

export async function revokeMemberSessions(client: Client, companyId: string, userId: string) {
  const { data, error } = await client.rpc("control_revoke_member_sessions", { p_company_id: requireUuid(companyId, "Organization"), p_user_id: requireUuid(userId, "User") });
  if (error) throw error;
  return Number(data || 0);
}

export async function getSecurityPolicy(client: Client, companyId: string) {
  const { data, error } = await client.from("control_security_policies").select("company_id,require_mfa_admins,require_mfa_all,allowed_email_domains,invitation_policy,updated_at,updated_by").eq("company_id", requireUuid(companyId, "Organization")).maybeSingle();
  if (error) throw error;
  return data as { company_id: string; require_mfa_admins: boolean; require_mfa_all: boolean; allowed_email_domains: string[]; invitation_policy: string } | null;
}

export async function updateSecurityPolicy(client: Client, companyId: string, input: { requireMfaAdmins: boolean; requireMfaAll: boolean; allowedDomains: string[]; invitationPolicy: "any_email" | "allowed_domains" }) {
  const { data, error } = await client.rpc("control_upsert_security_policy", { p_company_id: requireUuid(companyId, "Organization"), p_require_mfa_admins: input.requireMfaAdmins, p_require_mfa_all: input.requireMfaAll, p_allowed_domains: input.allowedDomains, p_invitation_policy: input.invitationPolicy });
  if (error) throw error;
  return data;
}

export async function listDomains(client: Client, companyId: string) {
  const { data, error } = await client.from("control_company_domains").select("id,company_id,domain,verification_token,verified_at,created_at").eq("company_id", requireUuid(companyId, "Organization")).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as DomainRow[];
}

export async function addDomain(client: Client, companyId: string, domain: string) {
  const { data, error } = await client.rpc("control_add_domain", { p_company_id: requireUuid(companyId, "Organization"), p_domain: z.string().trim().toLowerCase().min(3).max(253).parse(domain) });
  if (error) throw error;
  return data as DomainRow;
}

export async function getUsageSummary(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_usage_summary", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return (data || []) as UsageRow[];
}

export async function getStorageSummary(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_storage_summary", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return ((data || [])[0] || null) as StorageSummary | null;
}

export async function getRetentionPolicy(client: Client, companyId: string) {
  const { data, error } = await client.from("control_data_retention_policies").select("company_id,audit_log_days,support_attachment_days,deleted_file_days,inactive_account_days").eq("company_id", requireUuid(companyId, "Organization")).maybeSingle();
  if (error) throw error;
  return data as { company_id: string; audit_log_days: number | null; support_attachment_days: number | null; deleted_file_days: number | null; inactive_account_days: number | null } | null;
}

export async function updateRetentionPolicy(client: Client, companyId: string, input: { auditLogDays: number | null; supportAttachmentDays: number | null; deletedFileDays: number | null; inactiveAccountDays: number | null }) {
  const { data, error } = await client.rpc("control_upsert_retention_policy", { p_company_id: requireUuid(companyId, "Organization"), p_audit_log_days: input.auditLogDays, p_support_attachment_days: input.supportAttachmentDays, p_deleted_file_days: input.deletedFileDays, p_inactive_account_days: input.inactiveAccountDays });
  if (error) throw error;
  return data;
}

export async function listFeatureFlags(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_list_feature_flags", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return (data || []) as FeatureFlagRow[];
}

export async function setFeatureFlag(client: Client, companyId: string, flag: string, enabled: boolean, configuration: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc("control_set_feature_flag", { p_company_id: requireUuid(companyId, "Organization"), p_flag: requireCode(flag, "Feature flag"), p_enabled: enabled, p_configuration: configuration });
  if (error) throw error;
  return data as FeatureFlagRow;
}

export async function getBillingOverview(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_billing_overview", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return ((data || [])[0] || null) as BillingOverview | null;
}

export async function listIntegrations(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_list_integrations", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return (data || []) as IntegrationRow[];
}

export async function listApiKeys(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_list_api_keys", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return (data || []) as ApiKeyRow[];
}

export async function createApiKey(client: Client, companyId: string, name: string, scopes: string[], environment: string, expiresAt?: string | null) {
  const { data, error } = await client.rpc("control_create_api_key", { p_company_id: requireUuid(companyId, "Organization"), p_name: z.string().trim().min(1).max(120).parse(name), p_scopes: scopes.map((scope) => requireCode(scope, "Scope")), p_environment: environment, p_expires_at: expiresAt || null });
  if (error) throw error;
  return data as { id: string; name: string; key_prefix: string; secret: string; scopes: string[]; environment: string; expires_at: string | null; created_at: string };
}

export async function rotateApiKey(client: Client, companyId: string, keyId: string) {
  const { data, error } = await client.rpc("control_rotate_api_key", { p_company_id: requireUuid(companyId, "Organization"), p_key_id: requireUuid(keyId, "API key") });
  if (error) throw error;
  return data as { id: string; name: string; key_prefix: string; secret: string; scopes: string[]; environment: string; expires_at: string | null; created_at: string };
}

export async function revokeApiKey(client: Client, companyId: string, keyId: string) {
  const { error } = await client.rpc("control_revoke_api_key", { p_company_id: requireUuid(companyId, "Organization"), p_key_id: requireUuid(keyId, "API key") });
  if (error) throw error;
}

export async function listWebhooks(client: Client, companyId: string) {
  const { data, error } = await client.rpc("control_list_webhooks", { p_company_id: requireUuid(companyId, "Organization") });
  if (error) throw error;
  return (data || []) as WebhookRow[];
}

export async function createWebhook(client: Client, companyId: string, name: string, endpointUrl: string, events: string[], environment: string) {
  const { data, error } = await client.rpc("control_create_webhook", { p_company_id: requireUuid(companyId, "Organization"), p_name: z.string().trim().min(1).max(120).parse(name), p_endpoint_url: z.string().url().refine((value) => value.startsWith("https://"), "Webhook endpoints must use HTTPS.").parse(endpointUrl), p_events: events, p_environment: environment });
  if (error) throw error;
  return data as { id: string; name: string; endpoint_url: string; subscribed_events: string[]; environment: string; secret: string; secret_prefix: string; created_at: string };
}

export async function setWebhookStatus(client: Client, companyId: string, endpointId: string, status: "active" | "disabled") {
  const { error } = await client.rpc("control_set_webhook_status", { p_company_id: requireUuid(companyId, "Organization"), p_endpoint_id: requireUuid(endpointId, "Webhook"), p_status: status });
  if (error) throw error;
}

export async function deleteWebhook(client: Client, companyId: string, endpointId: string) {
  const { error } = await client.rpc("control_delete_webhook", { p_company_id: requireUuid(companyId, "Organization"), p_endpoint_id: requireUuid(endpointId, "Webhook") });
  if (error) throw error;
}

export async function testWebhook(client: Client, companyId: string, endpointId: string) {
  const { data, error } = await client.rpc("control_test_webhook", { p_company_id: requireUuid(companyId, "Organization"), p_endpoint_id: requireUuid(endpointId, "Webhook") });
  if (error) throw error;
  return data as string;
}

export async function refreshWebhookDelivery(client: Client, companyId: string, deliveryId: string) {
  const { error } = await client.rpc("control_refresh_webhook_delivery", { p_company_id: requireUuid(companyId, "Organization"), p_delivery_id: requireUuid(deliveryId, "Delivery") });
  if (error) throw error;
}

export async function listWebhookDeliveries(client: Client, companyId: string, endpointId: string) {
  const { data, error } = await client.rpc("control_list_webhook_deliveries", { p_company_id: requireUuid(companyId, "Organization"), p_endpoint_id: requireUuid(endpointId, "Webhook") });
  if (error) throw error;
  return (data || []) as WebhookDeliveryRow[];
}
