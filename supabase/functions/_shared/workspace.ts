import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

export type WorkspaceContext = {
  client: SupabaseClient;
  userId: string;
  companyId: string;
  companyIds: string[];
  productCompanyIds: string[];
  companyCurrency: string;
  profile: Record<string, unknown>;
};

export async function loadWorkspace(
  client: SupabaseClient,
  userId: string,
): Promise<Omit<WorkspaceContext, 'client' | 'userId'>> {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id,company_id,active_company_id,currency,invoice_language,role,first_name,last_name,company_name')
    .eq('id', userId)
    .single();
  if (profileError || !profile) throw new Error('No active OperiX profile was found.');

  const companyId = String(profile.active_company_id || profile.company_id || '');
  if (!companyId) throw new Error('No active company workspace is configured.');

  const { data: companies, error: companiesError } = await client
    .from('companies')
    .select('id,parent_company_id,company_name,currency')
    .order('company_name');
  if (companiesError) throw companiesError;

  const companyRows = (companies || []) as Array<Record<string, unknown>>;
  const companyIds = collectDescendants(companyRows, companyId);
  const selectedCompany = companyRows.find((company) => String(company.id || '') === companyId);
  const configuredCurrency = String(selectedCompany?.currency || profile.currency || 'EUR')
    .trim()
    .toUpperCase();
  // Product records intentionally remain owned by the selected tenant. This
  // matches the mobile workspace service and avoids cross-subdivision catalog
  // leakage when a parent company is selected.
  return {
    companyId,
    companyIds,
    productCompanyIds: [companyId],
    companyCurrency: /^[A-Z]{3}$/.test(configuredCurrency) ? configuredCurrency : 'EUR',
    profile: profile as Record<string, unknown>,
  };
}

export function collectDescendants(
  companies: ReadonlyArray<Record<string, unknown>>,
  rootCompanyId: string,
) {
  const result = [rootCompanyId];
  const visited = new Set(result);
  const queue = [rootCompanyId];
  while (queue.length) {
    const parentId = queue.shift();
    if (!parentId) continue;
    for (const company of companies) {
      if (String(company.parent_company_id || '') !== parentId) continue;
      const childId = String(company.id || '');
      if (!childId || visited.has(childId)) continue;
      visited.add(childId);
      result.push(childId);
      queue.push(childId);
    }
  }
  return result;
}

/** PostgREST scope used by the existing Invoice Mobile repository layer. */
export function scopedResource(userId: string, companyIds: readonly string[]) {
  return [
    `and(user_id.eq.${userId},company_id.is.null)`,
    ...companyIds.filter(Boolean).map((companyId) => `company_id.eq.${companyId}`),
  ].join(',');
}

export function productScope(userId: string, companyId: string) {
  return scopedResource(userId, [companyId]);
}
