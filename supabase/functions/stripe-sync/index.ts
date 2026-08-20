import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadStripeStore, syncStripeStore, type StripeStore } from '../_shared/stripeSync.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function userCanAccessCompany(admin: ReturnType<typeof createClient>, userId: string, companyId: string) {
  const [{ data: profile }, { data: memberships }, { data: companies }] = await Promise.all([
    admin.from('profiles').select('company_id,active_company_id').eq('id', userId).maybeSingle(),
    admin.from('memberships').select('company_id,status').eq('user_id', userId),
    admin.from('companies').select('id,parent_company_id,owner_id'),
  ])
  const rows = companies || []
  const byId = new Map(rows.map((row) => [row.id, row]))
  const grants = new Set<string>([
    ...(memberships || []).filter((row) => (row.status || 'active') === 'active').map((row) => row.company_id),
    ...rows.filter((row) => row.owner_id === userId).map((row) => row.id),
    ...[profile?.company_id, profile?.active_company_id].filter(Boolean) as string[],
  ])
  let current = companyId
  const visited = new Set<string>()
  while (current && !visited.has(current)) {
    if (grants.has(current)) return true
    visited.add(current)
    current = byId.get(current)?.parent_company_id || ''
  }
  return false
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405)

  let storeId: string | null = null
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return response({ error: 'Authentication required' }, 401)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return response({ error: 'Stripe sync is not configured on the server' }, 503)

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return response({ error: 'Invalid session' }, 401)
    const payload = await req.json().catch(() => ({})) as { store_id?: string; force?: boolean }
    storeId = payload.store_id || null

    const { data: profile } = await admin
      .from('profiles')
      .select('company_id,active_company_id')
      .eq('id', authData.user.id)
      .maybeSingle()
    const companyId = profile?.active_company_id || profile?.company_id

    let store: StripeStore
    if (storeId) {
      const { data, error } = await admin.from('stripe_stores').select('id,company_id').eq('id', storeId).maybeSingle()
      if (error) throw new Error(error.message)
      if (!data || !(await userCanAccessCompany(admin, authData.user.id, data.company_id))) {
        return response({ error: 'You do not have access to this Stripe store' }, 403)
      }
    } else if (companyId) {
      const { data, error } = await admin
        .from('stripe_stores')
        .select('id,company_id')
        .eq('company_id', companyId)
        .eq('status', 'connected')
        .order('created_at')
      if (error) throw new Error(error.message)
      const accessible = (data || []).filter((row) => row.company_id === companyId)
      if (accessible.length === 0) return response({ error: 'Stripe is not connected for this company' }, 400)
      if (accessible.length > 1) {
        return response({ error: 'Select a Stripe store before syncing multiple stores', stores: accessible }, 409)
      }
      storeId = accessible[0].id
    } else {
      return response({ error: 'A company or Stripe store is required' }, 400)
    }

    const loaded = await loadStripeStore(admin, storeId)
    if (!(await userCanAccessCompany(admin, authData.user.id, loaded.store.company_id))) {
      return response({ error: 'You do not have access to this Stripe store' }, 403)
    }
    const result = await syncStripeStore(admin, loaded.store, loaded.accessToken, { force: Boolean(payload.force) })
    return response({ success: true, ...result })
  } catch (error) {
    console.error('Stripe sync error:', error)
    if (storeId) {
      try {
        const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        await admin.from('stripe_stores').update({ status: 'error', last_error: error instanceof Error ? error.message.slice(0, 500) : 'Sync failed' }).eq('id', storeId)
      } catch (_) {
        // Preserve the original sync error.
      }
    }
    return response({ error: error instanceof Error ? error.message : 'Sync failed' }, 500)
  }
})
