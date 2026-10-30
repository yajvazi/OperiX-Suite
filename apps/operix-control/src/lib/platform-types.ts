export interface PlatformStats {
  generated_at: string;
  users: { total: number; new_7d: number; new_30d: number; active_7d: number; active_30d: number; unconfirmed: number; providers: Record<string, number> };
  signups_by_day: Array<{ day: string; count: number }>;
  workspaces: { total: number; new_30d: number; multi_member: number; by_cloud_status: Record<string, number> };
  subscriptions: { by_status: Array<{ product: string; status: string; count: number }>; paying: number; estimated_mrr_eur: number; manual_grants_active: number };
  activity: { invoices_total: number; invoices_30d: number; invoice_volume_30d: Record<string, number>; payments_30d: number; expenses_30d: number; customers_total: number; products_total: number };
  invoices_by_day: Array<{ day: string; count: number }>;
  top_workspaces_30d: Array<{ company_id: string; name: string; invoices: number }>;
  devices: { active: number; by_platform: Record<string, number>; push_sent_7d: number; push_pending: number };
}

export interface PlatformUserRow {
  id: string; email: string; full_name: string | null; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean;
  provider: string; workspaces: number; cloud_status: string; invoices: number; total_count: number;
}

export interface PlatformGrant { id: string; product: string; type: string; reason: string; expires_at: string | null; created_at: string }

export interface PlatformMembership {
  company_id: string; company_name: string; role: string; status: string; joined_at: string; is_root: boolean; root_company_id: string;
  cloud_status: string; members: number; invoices_30d: number;
  subscription: { product: string; status: string; interval: string | null; trial_ends_at: string | null; current_period_end: string | null; stripe: boolean } | null;
  grants: PlatformGrant[];
}

export interface PlatformUserDetail {
  user: { id: string; email: string; created_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null; provider: string; providers: string[]; banned_until: string | null; full_name: string | null; phone: string | null };
  invoices_total: number; last_invoice_at: string | null;
  devices: Array<{ platform: string | null; language: string | null; last_seen_at: string | null; is_active: boolean }>;
  memberships: PlatformMembership[];
}
