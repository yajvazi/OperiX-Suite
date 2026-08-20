import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  try {
    const authorization = req.headers.get('Authorization')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const clientId = Deno.env.get('STRIPE_CLIENT_ID')
    const clientSecret = Deno.env.get('STRIPE_SECRET_KEY')
    if (!authorization || !supabaseUrl || !serviceRoleKey) return response({ error: 'Authentication required' }, 401)
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return response({ error: 'Invalid session' }, 401)
    const payload = await req.json().catch(() => ({})) as { store_id?: string }
    if (!payload.store_id) return response({ error: 'Stripe store is required' }, 400)

    const { data: store, error: storeError } = await admin.from('stripe_stores').select('*').eq('id', payload.store_id).maybeSingle()
    if (storeError) throw new Error(storeError.message)
    if (!store || !(await userCanAccessCompany(admin, authData.user.id, store.company_id))) {
      return response({ error: 'You do not have access to this Stripe store' }, 403)
    }

    if (clientId && clientSecret && store.stripe_account_id) {
      const deauthorize = await fetch('https://connect.stripe.com/oauth/deauthorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          stripe_user_id: store.stripe_account_id,
        }),
      })
      if (!deauthorize.ok) console.warn('Stripe deauthorization returned', deauthorize.status)
    }

    const { error: secretError } = await admin.rpc('delete_stripe_store_secret', { p_stripe_store_id: store.id })
    if (secretError) throw new Error(secretError.message)
    const { error: updateError } = await admin.from('stripe_stores').update({
      status: 'disconnected',
      auto_sync: false,
      updated_at: new Date().toISOString(),
      updated_by: authData.user.id,
    }).eq('id', store.id)
    if (updateError) throw new Error(updateError.message)
    return response({ success: true, store_id: store.id })
  } catch (error) {
    console.error('Stripe disconnect error:', error)
    return response({ error: error instanceof Error ? error.message : 'Could not disconnect Stripe' }, 500)
  }
})

