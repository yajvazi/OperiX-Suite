export type ControlPermission =
  | "control.access"
  | "organization.read"
  | "organization.manage"
  | "users.read"
  | "users.manage"
  | "teams.read"
  | "teams.manage"
  | "roles.read"
  | "roles.manage"
  | "apps.read"
  | "apps.manage"
  | "integrations.read"
  | "integrations.manage"
  | "billing.read"
  | "billing.manage"
  | "usage.read"
  | "security.read"
  | "security.manage"
  | "audit.read"
  | "settings.read"
  | "settings.manage"
  | "api.read"
  | "api.manage"
  | "data.read"
  | "status.read";

export type ControlView =
  | "overview"
  | "organization"
  | "users"
  | "teams"
  | "roles"
  | "apps"
  | "integrations"
  | "automations"
  | "notifications"
  | "billing"
  | "usage"
  | "security"
  | "audit"
  | "api"
  | "data"
  | "status"
  | "settings";

export type WorkspaceProfile = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company_id?: string | null;
  active_company_id?: string | null;
  role?: string | null;
  company_name?: string | null;
  stripe_account_id?: string | null;
  stripe_connected_at?: string | null;
  stripe_livemode?: boolean | null;
};

export type WorkspaceCompany = {
  id: string;
  company_name?: string | null;
  name?: string | null;
  parent_company_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  tax_id?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  default_language?: string | null;
  currency?: string | null;
  archived_at?: string | null;
};

export type Workspace = {
  user: { id: string; email?: string | null } | null;
  profile: WorkspaceProfile;
  company: WorkspaceCompany | null;
  companies: WorkspaceCompany[];
  companyId: string | null;
  permissions: Set<ControlPermission>;
  accessChecked: boolean;
};

export type MemberRow = {
  membership_id: string;
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  legacy_role: string | null;
  status: string | null;
  role_code: string | null;
  role_name: string | null;
};

export type InvitationRow = {
  id: string;
  email: string;
  role_code: string;
  status: string;
  expires_at: string;
  created_at: string;
};

export type AppRegistryRow = {
  app_key: string;
  display_name: string;
  description: string | null;
  route: string | null;
  icon_key: string | null;
  available: boolean;
  subscription_requirement: string | null;
  sort_order: number;
};

export type AppEntitlementRow = {
  company_id: string;
  app_key: string;
  enabled: boolean;
  plan: string | null;
  enabled_at: string | null;
  disabled_at: string | null;
  settings: Record<string, unknown>;
};

export type MemberAppAccessRow = {
  membership_id: string;
  app_key: string;
  enabled: boolean;
  granted_at: string | null;
};

export type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_key: string | null;
  actor_user_id: string | null;
  occurred_at: string;
  has_changes?: boolean;
  application?: string | null;
};

export type RoleRow = {
  id: string;
  company_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
};

export type PermissionRow = {
  code: string;
  name: string;
  category: string;
  description: string | null;
  is_sensitive: boolean;
};

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  app_count: number;
  created_at: string;
};

export type SecuritySummary = {
  admin_count: number;
  mfa_enrolled_count: number;
  mfa_adoption: number;
  active_session_count: number;
  api_key_count: number;
  unread_notification_count: number;
};

export type MemberSecurityRow = {
  membership_id: string;
  user_id: string;
  mfa_enrolled: boolean;
  active_sessions: number;
  last_session_at: string | null;
};

export type NotificationRow = {
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string | null;
  href: string | null;
  source_application: string | null;
  created_at: string;
  read_at: string | null;
};

export type UsageRow = { metric: string; value: number; measured: boolean; source: string };
export type StorageSummary = { object_count: number; bytes: number; measured: boolean; source: string };

export type IntegrationRow = {
  provider: string;
  display_name: string;
  category: string;
  status: string;
  account_hint: string | null;
  used_by: string[];
  last_sync_at: string | null;
  last_error: string | null;
};

export type BillingOverview = {
  provider: string;
  plan_name: string | null;
  status: string | null;
  billing_cycle: string | null;
  next_invoice_at: string | null;
  current_period_end: string | null;
  seat_limit: number | null;
  storage_limit_bytes: number | null;
  portal_url: string | null;
  stripe_account_hint: string | null;
  stripe_connected_at: string | null;
};

export type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  environment: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type WebhookRow = {
  id: string;
  name: string;
  endpoint_url: string;
  subscribed_events: string[];
  environment: string;
  status: string;
  secret_prefix: string;
  last_delivery_at: string | null;
  success_count: number;
  failure_count: number;
  created_at: string;
};

export type WebhookDeliveryRow = {
  id: string;
  event_name: string;
  attempt: number;
  status: string;
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type DomainRow = {
  id: string;
  company_id: string;
  domain: string;
  verification_token: string;
  verified_at: string | null;
  created_at: string;
};

export type GroupAccessRow = { group_id: string; membership_id: string; app_key: string | null; enabled: boolean | null };
export type FeatureFlagRow = { flag: string; enabled: boolean; configuration: Record<string, unknown>; updated_at: string };
export type SearchResult = { entity_type: string; entity_id: string | null; title: string; subtitle: string | null; href: string };
export type PlatformOrganizationRow = { id: string; organization: string | null; owner_id: string | null; plan: string | null; member_count: number; enabled_apps: number; status: string; created_at: string };
