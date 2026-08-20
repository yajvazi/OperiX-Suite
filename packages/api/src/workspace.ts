import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface WorkspaceProfile {
  id: string;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  tax_id?: string;
  currency?: string;
  tax_rate?: number;
  tax_name?: string;
  bank_name?: string;
  bank_account?: string;
  bank_iban?: string;
  bank_swift?: string;
  invoice_language?: string;
  terms_conditions?: string;
  primary_color?: string;
  logo_url?: string;
  signature_url?: string;
  stamp_url?: string;
  role?: string;
  company_id?: string | null;
  active_company_id?: string | null;
  template_config?: unknown;
}

export interface WorkspaceCompany {
  id: string;
  parent_company_id?: string | null;
  company_name?: string;
  name?: string;
  trade_name?: string;
  unique_business_number?: string;
  fiscal_number?: string;
  vat_number?: string;
  business_activity?: string;
  email?: string;
  phone?: string;
  address?: string;
  registered_address?: string;
  city?: string;
  municipality?: string;
  country?: string;
  country_code?: string;
  website?: string;
  tax_id?: string;
  vat_registration_status?: string;
  vat_registration_date?: string;
  fiscal_year_start_month?: number;
  fiscal_year_start_day?: number;
  accounting_period_frequency?: string;
  default_language?: string;
  currency?: string;
  tax_rate?: number;
  tax_name?: string;
  bank_name?: string;
  bank_account?: string;
  bank_iban?: string;
  bank_swift?: string;
  invoice_language?: string;
  terms_conditions?: string;
  primary_color?: string;
  logo_url?: string;
  signature_url?: string;
  stamp_url?: string;
  template_config?: unknown;
}

export interface WorkspaceScope {
  user: User | null;
  profile: WorkspaceProfile;
  companyId: string;
  roleCode: 'super_administrator' | 'company_administrator' | 'manager' | 'employee';
  companyIds: string[];
  company: WorkspaceCompany | null;
  companies: WorkspaceCompany[];
  isGroup: boolean;
}

export interface ResolveWorkspaceOptions {
  /**
   * Booking and other operational clients should not hydrate accounting or
   * signature fields that they do not need. Existing Invoice callers keep the
   * legacy full projection by default.
   */
  includeSensitiveFields?: boolean;
}

export async function resolveWorkspace(
  client: SupabaseClient,
  userId: string,
  options: ResolveWorkspaceOptions = {},
): Promise<WorkspaceScope> {
  const includeSensitiveFields = options.includeSensitiveFields !== false;
  const profileSelect = includeSensitiveFields
    ? '*'
    : 'id,company_name,first_name,last_name,email,phone,address,website,primary_color,logo_url,role,company_id,active_company_id,currency,invoice_language';
  const companySelect = includeSensitiveFields
    ? '*'
    : 'id,parent_company_id,company_name,email,phone,address,city,municipality,country,country_code,website,primary_color,logo_url,currency,default_language';

  const { data: profileData, error: profileError } = await client
    .from('profiles')
    .select(profileSelect)
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;

  const profile = (profileData || { id: userId }) as unknown as WorkspaceProfile;
  let companyId = profile.active_company_id || profile.company_id;
  if (!companyId) {
    // Profiles are legacy workspace metadata. A user can still have a valid
    // tenant membership when that row was not created or was removed.
    const { data: membershipRows, error: membershipError } = await client
      .from('memberships')
      .select('company_id, role')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);
    if (membershipError) throw membershipError;
    const membership = (membershipRows || [])[0] as { company_id?: string | null; role?: string | null } | undefined;
    companyId = membership?.company_id || null;
    if (companyId) {
      profile.company_id = companyId;
      profile.active_company_id = companyId;
      profile.role = profile.role || membership?.role || undefined;
    }
  }
  if (!companyId) throw new Error('No active company workspace is configured.');

  const { data: companiesData, error: companiesError } = await client
    .from('companies')
    .select(companySelect)
    .order('company_name');
  if (companiesError) throw companiesError;

  const companies = (companiesData || []) as unknown as WorkspaceCompany[];
  const companyIds = collectCompanyScope(companies, companyId);
  const { data: roleData, error: roleError } = await client.rpc('get_my_company_role', { p_company_id: companyId });
  if (roleError) throw roleError;
  // Tenant authorization is intentionally independent from the legacy
  // profile-level role column. If the role RPC is unavailable, fail closed.
  const canonicalRoles = ['super_administrator', 'company_administrator', 'manager', 'employee'] as const;
  const roleCode = (typeof roleData === 'string' && canonicalRoles.includes(roleData as (typeof canonicalRoles)[number])
    ? roleData
    : 'employee') as WorkspaceScope['roleCode'];
  return {
    user: null,
    profile,
    companyId,
    roleCode,
    companyIds,
    company: companies.find((candidate) => candidate.id === companyId) || null,
    companies,
    isGroup: companyIds.length > 1,
  };
}

export function collectCompanyScope(companies: readonly WorkspaceCompany[], rootCompanyId: string) {
  const companyIds = [rootCompanyId];
  const visited = new Set(companyIds);
  const pending = [rootCompanyId];
  while (pending.length) {
    const parentId = pending.shift();
    if (!parentId) continue;
    companies
      .filter((candidate) => candidate.parent_company_id === parentId)
      .forEach((child) => {
        if (visited.has(child.id)) return;
        visited.add(child.id);
        companyIds.push(child.id);
        pending.push(child.id);
      });
  }
  return companyIds;
}

/** PostgREST OR expression shared by every tenant-owned legacy table. */
export function scopedResource(userId: string, companyIds: string | readonly string[]) {
  const ids = Array.isArray(companyIds) ? companyIds : [companyIds];
  return [
    `and(user_id.eq.${userId},company_id.is.null)`,
    ...ids.filter(Boolean).map((companyId) => `company_id.eq.${companyId}`),
  ].join(',');
}

export function scopedSearch(scope: string, fields: readonly string[], pattern: string) {
  const clauses = splitScopeClauses(scope);
  return fields.flatMap((field) => clauses.map((clause) => {
    const normalized = clause.startsWith('and(') && clause.endsWith(')') ? clause.slice(4, -1) : clause;
    return `and(${normalized},${field}.ilike.${pattern})`;
  })).join(',');
}

function splitScopeClauses(scope: string) {
  const clauses: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of scope) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      if (current) clauses.push(current);
      current = '';
    } else current += character;
  }
  if (current) clauses.push(current);
  return clauses;
}
