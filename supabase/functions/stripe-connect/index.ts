// Stripe Connect OAuth callback.
// The state is a one-time, expiring server-side nonce. No user identifier is
// accepted from the browser and no Stripe credential is returned to the app.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function callbackRedirect(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString()
  const target = `operix-invoice://stripe-callback?${query}`
  return new Response(
    `<html><body><script>window.location.replace(${JSON.stringify(target)})</script><p>You can return to OperiX.</p></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } },
  )
}

async function hashState(state: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function stripeAccount(accessToken: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
  const apiVersion = Deno.env.get('STRIPE_API_VERSION')
  if (apiVersion) headers['Stripe-Version'] = apiVersion
  const result = await fetch('https://api.stripe.com/v1/account', { headers })
  const data = await result.json().catch(() => ({}))
  if (!result.ok || data?.error) throw new Error(data?.error?.message || 'Could not read the connected Stripe account')
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description') || oauthError
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')

  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
    return callbackRedirect({ success: 'false', error: 'Stripe connection is not configured on the server' })
  }
  if (!state) return callbackRedirect({ success: 'false', error: 'Missing OAuth state' })

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const stateHash = await hashState(state)
  const { data: stateRows, error: stateError } = await admin.rpc('consume_stripe_oauth_state', {
    p_state_hash: stateHash,
  })
  const stateRow = Array.isArray(stateRows) ? stateRows[0] : stateRows
  if (stateError || !stateRow?.stripe_store_id || !stateRow?.user_id) {
    return callbackRedirect({ success: 'false', error: 'The Stripe connection request expired or was already used' })
  }

  const storeId = stateRow.stripe_store_id as string
  const userId = stateRow.user_id as string

  const fail = async (message: string) => {
    await admin.from('stripe_stores').update({ status: 'error', last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', storeId)
    return callbackRedirect({ success: 'false', error: message })
  }

  if (oauthError || !code) return fail(errorDescription || 'Stripe authorization was cancelled')

  try {
    const tokenResponse = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_secret: stripeSecretKey,
        code,
        grant_type: 'authorization_code',
      }),
    })
    const tokenData = await tokenResponse.json().catch(() => ({}))
    if (!tokenResponse.ok || tokenData?.error || !tokenData?.access_token || !tokenData?.stripe_user_id) {
      return fail(tokenData?.error_description || tokenData?.error || 'Stripe token exchange failed')
    }

    const account = await stripeAccount(tokenData.access_token)
    const connectedAt = new Date().toISOString()
    const { error: secretError } = await admin.rpc('upsert_stripe_store_secret', {
      p_stripe_store_id: storeId,
      p_access_token: tokenData.access_token,
      p_refresh_token: tokenData.refresh_token || null,
      p_livemode: Boolean(tokenData.livemode),
    })
    if (secretError) throw new Error(secretError.message)

    const { error: storeError } = await admin
      .from('stripe_stores')
      .update({
        stripe_account_id: tokenData.stripe_user_id,
        account_email: account.email || null,
        livemode: Boolean(tokenData.livemode),
        status: 'connected',
        connected_at: connectedAt,
        last_error: null,
        updated_at: connectedAt,
        updated_by: userId,
      })
      .eq('id', storeId)
    if (storeError) throw new Error(storeError.message)

    // Keep non-sensitive legacy status fields usable for older dashboard
    // screens; access and refresh tokens are never written back to profiles.
    await admin.from('profiles').update({
      stripe_account_id: tokenData.stripe_user_id,
      stripe_connected_at: connectedAt,
      stripe_livemode: Boolean(tokenData.livemode),
    }).eq('id', userId)

    return callbackRedirect({ success: 'true', store_id: storeId, account_id: tokenData.stripe_user_id })
  } catch (error) {
    console.error('Stripe Connect callback error:', error)
    return fail(error instanceof Error ? error.message : 'Could not save the Stripe connection')
  }
})
