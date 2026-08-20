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

function base64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
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
    if (!authorization) return response({ error: 'Authentication required' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const clientId = Deno.env.get('STRIPE_CLIENT_ID')
    if (!supabaseUrl || !serviceRoleKey || !clientId) {
      return response({ error: 'Stripe connection is not configured on the server' }, 503)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return response({ error: 'Invalid session' }, 401)

    const payload = await req.json().catch(() => ({})) as {
      company_id?: string
      store_id?: string
      store_name?: string
      branch_id?: string | null
    }
    const { data: profile } = await admin
      .from('profiles')
      .select('company_id,active_company_id')
      .eq('id', authData.user.id)
      .maybeSingle()
    const companyId = payload.company_id || profile?.active_company_id || profile?.company_id
    if (!companyId || !(await userCanAccessCompany(admin, authData.user.id, companyId))) {
      return response({ error: 'You do not have access to this company' }, 403)
    }

    const { data: company } = await admin.from('companies').select('company_name').eq('id', companyId).single()
    let store: Record<string, unknown> | null = null
    if (payload.store_id) {
      const { data, error } = await admin
        .from('stripe_stores')
        .select('*')
        .eq('id', payload.store_id)
        .eq('company_id', companyId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      store = data
    }

    const requestedName = (payload.store_name || '').trim()
    const storeName = requestedName || (company?.company_name ? `${company.company_name} Stripe` : 'Stripe Store')
    if (!store) {
      const { data: existing } = await admin
        .from('stripe_stores')
        .select('*')
        .eq('company_id', companyId)
        .eq('store_name', storeName)
        .maybeSingle()
      if (existing) {
        store = existing
      } else {
        const { data, error } = await admin
          .from('stripe_stores')
          .insert({
            company_id: companyId,
            branch_id: payload.branch_id || null,
            store_name: storeName,
            status: 'pending',
            created_by: authData.user.id,
            updated_by: authData.user.id,
          })
          .select('*')
          .single()
        if (error) throw new Error(error.message)
        store = data
      }
    }

    if (!store?.id) return response({ error: 'Could not create the Stripe store' }, 500)
    const stateBytes = new Uint8Array(32)
    crypto.getRandomValues(stateBytes)
    const state = base64Url(stateBytes)
    const stateHash = await sha256(state)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const { error: stateError } = await admin.rpc('create_stripe_oauth_state', {
      p_state_hash: stateHash,
      p_stripe_store_id: store.id,
      p_user_id: authData.user.id,
      p_expires_at: expiresAt,
    })
    if (stateError) throw new Error(stateError.message)

    await admin
      .from('stripe_stores')
      .update({ status: 'pending', last_error: null, updated_at: new Date().toISOString(), updated_by: authData.user.id })
      .eq('id', store.id)

    const publicSupabaseUrl = Deno.env.get('SUPABASE_PUBLIC_URL')?.trim() || supabaseUrl
    const redirectUri = `${publicSupabaseUrl.replace(/\/$/, '')}/functions/v1/stripe-connect`
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'read_write',
      state,
      redirect_uri: redirectUri,
    })
    if (authData.user.email) params.set('stripe_user[email]', authData.user.email)
    if (company?.company_name) params.set('stripe_user[business_name]', company.company_name)
    return response({
      url: `https://connect.stripe.com/oauth/authorize?${params.toString()}`,
      store_id: store.id,
      store_name: store.store_name,
    })
  } catch (error) {
    console.error('Stripe start error:', error)
    return response({ error: error instanceof Error ? error.message : 'Could not start Stripe connection' }, 500)
  }
})
