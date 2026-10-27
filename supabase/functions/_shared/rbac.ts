import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type WorkspaceAccess = {
  platform_admin?: boolean
  permissions?: string[]
}

/** Evaluate tenant RBAC with the caller's JWT, never with the service key. */
export async function userHasCompanyPermission(
  supabaseUrl: string,
  accessToken: string,
  companyId: string,
  permission: string,
) {
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!anonKey) return { allowed: false, error: new Error('SUPABASE_ANON_KEY is not configured') }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data, error } = await userClient.rpc('rbac_get_workspace_access', { p_company_id: companyId })
  if (error) return { allowed: false, error }
  const access = (data || {}) as WorkspaceAccess
  return {
    allowed: Boolean(access.platform_admin) || (access.permissions || []).includes(permission),
    error: null,
  }
}
