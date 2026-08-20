import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadStripeStore, syncStripeStore } from '../_shared/stripeSync.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, stripe-signature',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return new Uint8Array()
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  return bytes
}

async function signedPayload(timestamp: string, body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
  return new Uint8Array(signature)
}

async function verifySignature(body: string, header: string | null, secret: string) {
  if (!header) return false
  const parts = header.split(',').map((part) => part.split('='))
  const timestamp = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value).filter(Boolean)
  if (!timestamp || signatures.length === 0) return false
  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 600) return false
  const expected = await signedPayload(timestamp, body, secret)
  return signatures.some((signature) => constantTimeEqual(expected, hexToBytes(signature)))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) return json({ error: 'Stripe webhook is not configured' }, 503)

  const body = await req.text()
  if (!(await verifySignature(body, req.headers.get('stripe-signature'), webhookSecret))) {
    return json({ error: 'Invalid Stripe signature' }, 400)
  }

  let event: { id?: string; type?: string; account?: string; data?: { object?: Record<string, unknown> } }
  try {
    event = JSON.parse(body)
  } catch (_) {
    return json({ error: 'Invalid event body' }, 400)
  }
  if (!event.id || !event.type) return json({ error: 'Stripe event is missing an id or type' }, 400)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  let storeId: string | null = null
  try {
    const accountId = event.account || String(event.data?.object?.account || '')
    if (!accountId) return json({ received: true, ignored: 'No connected account on event' })
    const { data: store, error: storeError } = await admin
      .from('stripe_stores')
      .select('id')
      .eq('stripe_account_id', accountId)
      .maybeSingle()
    if (storeError) throw new Error(storeError.message)
    if (!store) return json({ received: true, ignored: 'Unknown connected account' })
    storeId = store.id

    const { data: claimed, error: claimError } = await admin.rpc('claim_stripe_webhook_event', {
      p_event_id: event.id,
      p_stripe_store_id: storeId,
      p_event_type: event.type,
    })
    if (claimError) throw new Error(claimError.message)
    if (!claimed) return json({ received: true, duplicate: true })

    const loaded = await loadStripeStore(admin, storeId)
    if (!loaded.store.auto_sync) {
      await admin.rpc('complete_stripe_webhook_event', { p_event_id: event.id, p_error_message: null })
      return json({ received: true, ignored: 'Automatic sync is disabled for this store' })
    }
    const result = await syncStripeStore(admin, loaded.store, loaded.accessToken, { force: false })
    await admin.rpc('complete_stripe_webhook_event', { p_event_id: event.id, p_error_message: null })
    return json({ received: true, synced: true, ...result })
  } catch (error) {
    console.error('Stripe webhook error:', error)
    await admin.rpc('complete_stripe_webhook_event', {
      p_event_id: event.id,
      p_error_message: error instanceof Error ? error.message.slice(0, 500) : 'Webhook sync failed',
    }).catch(() => undefined)
    return json({ error: error instanceof Error ? error.message : 'Webhook processing failed' }, 500)
  }
})
