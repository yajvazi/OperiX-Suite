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
  owner_id?: string | null;
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
  /** Effective tenant permissions returned by the protected RBAC RPC. */
  permissions: string[];
  /** Effective OWN/ASSIGNED/ALL scopes returned by the protected RBAC RPC. */
  scopes: Record<string, 'OWN' | 'ASSIGNED' | 'ALL'>;
  /** True only when control_platform_admins authorizes the current user. */
  platformAdmin: boolean;
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
  /**
   * Product clients should use the account's explicit tenant memberships.
   * Platform-control surfaces can omit this to retain their broader
   * platform-admin workspace view.
   */
  membershipOnly?: boolean;
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
    : 'id,owner_id,parent_company_id,company_name,email,phone,address,city,municipality,country,country_code,website,primary_color,logo_url,currency,default_language';

  const { data: profileData, error: profileError } = await client
    .from('profiles')
    .select(profileSelect)
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;

  const profile = (profileData || { id: userId }) as unknown as WorkspaceProfile;
  let companies: WorkspaceCompany[];
  if (options.membershipOnly) {
    // Do not enumerate `companies` and then filter in JavaScript. That still
    // sends unrelated tenant names and identifiers to the device. The
    // membership query is protected by the memberships RLS policy, while the
    // explicit company filters keep platform-admin access from broadening the
    // Booking workspace switcher.
    const { data: membershipData, error: membershipError } = await client
      .from('memberships')
      .select('company_id,status,role')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (membershipError) throw membershipError;
    const activeMemberships = (membershipData || []) as Array<{ company_id?: string | null; status?: string | null; role?: string | null }>;
    const membershipCompanyIds = [...new Set(activeMemberships
      .filter((membership) => membership.status === 'active')
      .map((membership) => membership.company_id)
      .filter((companyId): companyId is string => Boolean(companyId)))];

    const memberCompanyQuery = membershipCompanyIds.length
      ? client.from('companies').select(companySelect).in('id', membershipCompanyIds).is('archived_at', null).order('company_name')
      : Promise.resolve({ data: [], error: null });
    const ownedCompanyQuery = client.from('companies').select(companySelect).eq('owner_id', userId).is('archived_at', null).order('company_name');
    const [memberCompanyResult, ownedCompanyResult] = await Promise.all([memberCompanyQuery, ownedCompanyQuery]);
    if (memberCompanyResult.error) throw memberCompanyResult.error;
    if (ownedCompanyResult.error) throw ownedCompanyResult.error;

    const membershipIdSet = new Set(membershipCompanyIds);
    const ownedCompanies = ((ownedCompanyResult.data || []) as unknown as WorkspaceCompany[])
      .filter((company) => company.owner_id === userId);
    const memberCompanies = ((memberCompanyResult.data || []) as unknown as WorkspaceCompany[])
      .filter((company) => membershipIdSet.has(company.id));
    const deduped = new Map<string, WorkspaceCompany>();
    [...memberCompanies, ...ownedCompanies].forEach((company) => deduped.set(company.id, company));

    // Parent memberships also authorize active subdivisions. Walk only from
    // the explicit roots above so a platform-admin RLS policy cannot broaden
    // the Booking response to unrelated top-level tenants.
    let parentIds = [...deduped.keys()];
    while (parentIds.length) {
      const { data: childData, error: childError } = await client
        .from('companies')
        .select(companySelect)
        .in('parent_company_id', parentIds)
        .is('archived_at', null)
        .order('company_name');
      if (childError) throw childError;
      const nextParentIds: string[] = [];
      const parentIdSet = new Set(parentIds);
      for (const child of ((childData || []) as unknown as WorkspaceCompany[])) {
        if (!child.parent_company_id || !parentIdSet.has(child.parent_company_id)) continue;
        if (deduped.has(child.id)) continue;
        deduped.set(child.id, child);
        nextParentIds.push(child.id);
      }
      parentIds = nextParentIds;
    }
    companies = [...deduped.values()].sort((left, right) => (left.company_name || left.name || '').localeCompare(right.company_name || right.name || ''));
  } else {
    const { data: companiesData, error: companiesError } = await client
      .from('companies')
      .select(companySelect)
      .order('company_name');
    if (companiesError) throw companiesError;
    companies = (companiesData || []) as unknown as WorkspaceCompany[];
  }

  const preferredCompanyId = profile.active_company_id || profile.company_id;
  const companyId = (preferredCompanyId && companies.some((company) => company.id === preferredCompanyId))
    ? preferredCompanyId
    : companies[0]?.id || null;
  if (!companyId) throw new Error('No active company workspace is configured.');
  if (preferredCompanyId !== companyId) {
    profile.company_id = companyId;
    profile.active_company_id = companyId;
  }

  const companyIds = collectCompanyScope(companies, companyId);
  const { data: roleData, error: roleError } = await client.rpc('get_my_company_role', { p_company_id: companyId });
  if (roleError) throw roleError;
  const { data: accessData, error: accessError } = await client.rpc('rbac_get_workspace_access', { p_company_id: companyId });
  if (accessError) throw accessError;
  // Tenant authorization is intentionally independent from the legacy
  // profile-level role column. If the role RPC is unavailable, fail closed.
  const canonicalRoles = ['super_administrator', 'company_administrator', 'manager', 'employee'] as const;
  const roleCode = (typeof roleData === 'string' && canonicalRoles.includes(roleData as (typeof canonicalRoles)[number])
    ? roleData
    : 'employee') as WorkspaceScope['roleCode'];
  const access = accessData && typeof accessData === 'object' ? accessData as {
    permissions?: unknown;
    scopes?: unknown;
    platform_admin?: unknown;
    role_code?: unknown;
  } : {};
  const permissions = Array.isArray(access.permissions)
    ? access.permissions.filter((permission): permission is string => typeof permission === 'string')
    : [];
  const scopes = access.scopes && typeof access.scopes === 'object'
    ? Object.fromEntries(Object.entries(access.scopes).filter(([, scope]) => scope === 'OWN' || scope === 'ASSIGNED' || scope === 'ALL')) as Record<string, 'OWN' | 'ASSIGNED' | 'ALL'>
    : {};
  const platformAdmin = access.platform_admin === true;
  const accessRole = typeof access.role_code === 'string' && canonicalRoles.includes(access.role_code as (typeof canonicalRoles)[number])
    ? access.role_code as WorkspaceScope['roleCode']
    : roleCode;
  return {
    user: null,
    profile,
    companyId,
    roleCode: accessRole,
    permissions,
    scopes,
    platformAdmin,
    companyIds,
    company: companies.find((candidate) => candidate.id === companyId) || null,
    companies,
    isGroup: companyIds.length > 1,
  };
}

export function hasWorkspacePermission(scope: Pick<WorkspaceScope, 'permissions' | 'platformAdmin'>, permission: string) {
  return scope.platformAdmin || scope.permissions.includes(permission);
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
