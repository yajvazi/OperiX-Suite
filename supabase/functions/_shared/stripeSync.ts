import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_API_BASE = 'https://api.stripe.com/v1'

export type StripeStore = {
  id: string
  company_id: string
  branch_id?: string | null
  store_name: string
  stripe_account_id: string
  account_email?: string | null
  livemode: boolean
  status: string
  auto_sync: boolean
  auto_invoice_sales: boolean
  connected_at?: string | null
  last_synced_at?: string | null
  created_by?: string | null
}

type StripeBalanceTransaction = {
  id: string
  type?: string
  amount?: number
  currency?: string
  description?: string | null
  fee?: number
  net?: number
  status?: string
  created?: number
  available_on?: number
  source?: unknown
  livemode?: boolean
}

type StripePayout = {
  id: string
  amount?: number
  currency?: string
  arrival_date?: number
  status?: string
  method?: string
  description?: string | null
  created?: number
  livemode?: boolean
}

type StripeSource = {
  id?: string
  object?: string
  customer?: string | { id?: string } | null
  payment_intent?: string | { id?: string } | null
  receipt_email?: string | null
  receipt_url?: string | null
  description?: string | null
  metadata?: Record<string, string>
  billing_details?: {
    name?: string | null
    email?: string | null
    phone?: string | null
    address?: Record<string, string | null> | null
  } | null
  customer_details?: {
    name?: string | null
    email?: string | null
    phone?: string | null
    address?: Record<string, string | null> | null
  } | null
  payment_method_details?: Record<string, unknown> | null
}

type StripeCheckoutLine = {
  description?: string | null
  quantity?: number | null
  amount_total?: number | null
  price?: {
    unit_amount?: number | null
    product?: string | { id?: string; name?: string; metadata?: Record<string, string> } | null
  } | null
}

export type StripeSyncResult = {
  storeId: string
  transactionsCount: number
  payoutsCount: number
  invoicesCreated: number
  totalSales: number
  totalPayouts: number
  totalFees: number
  balances: Array<{
    currency: string
    available: number
    pending: number
  }>
  truncated: boolean
  warnings: string[]
}

function stripeHeaders(accessToken: string, accountId?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  const apiVersion = Deno.env.get('STRIPE_API_VERSION')
  if (apiVersion) headers['Stripe-Version'] = apiVersion
  // OAuth access tokens are already scoped to the connected account. The
  // optional header is useful for deployments using an account-scoped key.
  if (accountId && Deno.env.get('STRIPE_USE_ACCOUNT_HEADER') === 'true') {
    headers['Stripe-Account'] = accountId
  }
  return headers
}

async function stripeRequest<T>(
  accessToken: string,
  path: string,
  params: Array<[string, string]> = [],
  accountId?: string,
): Promise<T> {
  const url = new URL(`${STRIPE_API_BASE}${path}`)
  for (const [key, value] of params) url.searchParams.append(key, value)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: stripeHeaders(accessToken, accountId),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.error) {
    throw new Error(body?.error?.message || `Stripe request failed (${response.status})`)
  }
  return body as T
}

function majorUnits(value: unknown) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Number((amount / 100).toFixed(4)) : 0
}

function isoDateTime(seconds: unknown) {
  const timestamp = Number(seconds || 0)
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : new Date().toISOString()
}

function sourceId(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id?: unknown }).id || '')
  return ''
}

function sourceObject(value: unknown): StripeSource {
  return value && typeof value === 'object' ? value as StripeSource : {}
}

function objectAddress(source: StripeSource) {
  return source.billing_details?.address || source.customer_details?.address || {}
}

function sourceCustomerId(source: StripeSource) {
  return sourceId(source.customer)
}

async function checkoutLineItems(
  accessToken: string,
  source: StripeSource,
  accountId: string,
): Promise<StripeCheckoutLine[]> {
  const paymentIntentId = sourceId(source.payment_intent)
  if (!paymentIntentId) return []

  const sessions = await stripeRequest<{ data?: Array<{ id: string }> }>(
    accessToken,
    '/checkout/sessions',
    [['payment_intent', paymentIntentId], ['limit', '1']],
    accountId,
  )
  const sessionId = sessions.data?.[0]?.id
  if (!sessionId) return []

  const lines = await stripeRequest<{ data?: StripeCheckoutLine[] }>(
    accessToken,
    `/checkout/sessions/${encodeURIComponent(sessionId)}/line_items`,
    [['limit', '100']],
    accountId,
  )
  return lines.data || []
}

function normalizeLineItems(lines: StripeCheckoutLine[]) {
  return lines
    .map((line) => {
      const quantity = Math.max(Number(line.quantity || 1), 0.0001)
      const unitAmount = line.price?.unit_amount == null
        ? Number(line.amount_total || 0) / quantity
        : Number(line.price.unit_amount)
      const product = line.price?.product
      const productName = product && typeof product === 'object' ? product.name : null
      const productId = product && typeof product === 'object' ? product.id : product
      return {
        description: line.description || productName || 'Stripe online sale item',
        quantity,
        unit: 'pcs',
        unit_price: majorUnits(unitAmount),
        tax_rate: 0,
        discount: 0,
        tax_included: false,
        sku: productId || '',
        amount: majorUnits(unitAmount * quantity),
      }
    })
    .filter((line) => line.unit_price >= 0)
}

async function listBalanceTransactions(
  accessToken: string,
  accountId: string,
  lastSyncedAt: string | null | undefined,
  force: boolean,
) {
  const rows: StripeBalanceTransaction[] = []
  let startingAfter = ''
  let hasMore = true
  let pages = 0
  const maxPages = 100
  const since = !force && lastSyncedAt
    ? Math.floor((new Date(lastSyncedAt).getTime() - 2 * 24 * 60 * 60 * 1000) / 1000)
    : 0

  while (hasMore && pages < maxPages) {
    const params: Array<[string, string]> = [
      ['limit', '100'],
      ['expand[]', 'data.source'],
    ]
    if (since > 0) params.push(['created[gte]', String(since)])
    if (startingAfter) params.push(['starting_after', startingAfter])
    const result = await stripeRequest<{ data?: StripeBalanceTransaction[]; has_more?: boolean }>(
      accessToken,
      '/balance_transactions',
      params,
      accountId,
    )
    const page = result.data || []
    rows.push(...page)
    hasMore = Boolean(result.has_more) && page.length > 0
    startingAfter = page.at(-1)?.id || ''
    pages += 1
  }

  return { rows, truncated: hasMore }
}

async function listPayouts(
  accessToken: string,
  accountId: string,
  lastSyncedAt: string | null | undefined,
  force: boolean,
) {
  const rows: StripePayout[] = []
  let startingAfter = ''
  let hasMore = true
  let pages = 0
  const maxPages = 100
  const since = !force && lastSyncedAt
    ? Math.floor((new Date(lastSyncedAt).getTime() - 2 * 24 * 60 * 60 * 1000) / 1000)
    : 0

  while (hasMore && pages < maxPages) {
    const params: Array<[string, string]> = [['limit', '100']]
    if (since > 0) params.push(['created[gte]', String(since)])
    if (startingAfter) params.push(['starting_after', startingAfter])
    const result = await stripeRequest<{ data?: StripePayout[]; has_more?: boolean }>(
      accessToken,
      '/payouts',
      params,
      accountId,
    )
    const page = result.data || []
    rows.push(...page)
    hasMore = Boolean(result.has_more) && page.length > 0
    startingAfter = page.at(-1)?.id || ''
    pages += 1
  }

  return { rows, truncated: hasMore }
}

async function upsertBalanceSnapshots(
  admin: SupabaseClient,
  store: StripeStore,
  balance: {
    available?: Array<{ amount?: number; currency?: string }>
    pending?: Array<{ amount?: number; currency?: string }>
  },
) {
  const currencies = new Set<string>()
  for (const row of [...(balance.available || []), ...(balance.pending || [])]) {
    if (row.currency) currencies.add(row.currency.toUpperCase())
  }

  const snapshots: Array<Record<string, unknown>> = []
  const rows = [...currencies].map((currency) => {
    const available = (balance.available || []).find((row) => row.currency?.toUpperCase() === currency)
    const pending = (balance.pending || []).find((row) => row.currency?.toUpperCase() === currency)
    const snapshot = {
      stripe_store_id: store.id,
      company_id: store.company_id,
      currency,
      available_balance: majorUnits(available?.amount),
      pending_balance: majorUnits(pending?.amount),
      as_of: new Date().toISOString(),
      raw_balance: { available, pending },
    }
    snapshots.push(snapshot)
    return snapshot
  })

  if (rows.length) {
    const { error } = await admin.from('stripe_balance_snapshots').upsert(rows, {
      onConflict: 'stripe_store_id,currency',
    })
    if (error) throw new Error(`Could not save Stripe balance snapshots: ${error.message}`)
  }

  for (const currency of currencies) {
    const { error } = await admin.rpc('ensure_stripe_fund_account_for_sync', {
      p_stripe_store_id: store.id,
      p_currency: currency,
    })
    if (error) throw new Error(`Could not create Stripe fund: ${error.message}`)
  }

  return snapshots.map((snapshot) => ({
    currency: String(snapshot.currency),
    available: Number(snapshot.available_balance || 0),
    pending: Number(snapshot.pending_balance || 0),
  }))
}

function compactSource(source: StripeSource) {
  return {
    id: source.id || null,
    object: source.object || null,
    customer: sourceCustomerId(source) || null,
    payment_intent: sourceId(source.payment_intent) || null,
    receipt_email: source.receipt_email || null,
    receipt_url: source.receipt_url || null,
    description: source.description || null,
    metadata: source.metadata || {},
    billing_details: source.billing_details || null,
    customer_details: source.customer_details || null,
    payment_method_details: source.payment_method_details || null,
  }
}

export async function syncStripeStore(
  admin: SupabaseClient,
  store: StripeStore,
  accessToken: string,
  options: { force?: boolean } = {},
): Promise<StripeSyncResult> {
  const force = Boolean(options.force)
  const warnings: string[] = []
  const [balance, transactions, payouts] = await Promise.all([
    stripeRequest<{ available?: Array<{ amount?: number; currency?: string }>; pending?: Array<{ amount?: number; currency?: string }> }>(
      accessToken,
      '/balance',
      [],
      store.stripe_account_id,
    ),
    listBalanceTransactions(accessToken, store.stripe_account_id, store.last_synced_at, force),
    listPayouts(accessToken, store.stripe_account_id, store.last_synced_at, force),
  ])

  const balanceRows = await upsertBalanceSnapshots(admin, store, balance)
  const limitedTransactions = transactions.rows
  let transactionsCount = 0
  let invoicesCreated = 0
  let totalSales = 0
  let totalFees = 0

  for (const transaction of limitedTransactions) {
    const source = sourceObject(transaction.source)
    let lineItems: ReturnType<typeof normalizeLineItems> = []
    if (transaction.type === 'charge' || transaction.type === 'payment') {
      try {
        lineItems = normalizeLineItems(await checkoutLineItems(accessToken, source, store.stripe_account_id))
      } catch (error) {
        warnings.push(`Could not load Checkout lines for ${transaction.id}: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    }

    const billing = source.billing_details || source.customer_details || {}
    const address = objectAddress(source)
    const record = {
      user_id: store.created_by || null,
      company_id: store.company_id,
      stripe_store_id: store.id,
      stripe_id: transaction.id,
      type: transaction.type || 'other',
      amount: majorUnits(transaction.amount),
      currency: (transaction.currency || 'eur').toUpperCase(),
      description: source.description || transaction.description || 'Stripe transaction',
      customer_email: source.receipt_email || source.billing_details?.email || source.customer_details?.email || source.metadata?.customer_email || source.metadata?.email || null,
      customer_name: billing.name || null,
      customer_phone: billing.phone || null,
      stripe_customer_id: sourceCustomerId(source) || null,
      source_object_id: source.id || null,
      source_payment_intent: sourceId(source.payment_intent) || null,
      receipt_url: source.receipt_url || null,
      customer_address: address,
      line_items: lineItems,
      metadata: source.metadata || {},
      status: transaction.status || null,
      fee: majorUnits(transaction.fee),
      net: majorUnits(transaction.net),
      created_at: isoDateTime(transaction.created),
      payment_details: compactSource(source),
      livemode: Boolean(transaction.livemode ?? store.livemode),
    }

    const { data: saved, error } = await admin
      .from('stripe_transactions')
      .upsert(record, { onConflict: 'stripe_store_id,stripe_id' })
      .select('id,invoice_id')
      .single()
    if (error || !saved) {
      warnings.push(`Could not save Stripe transaction ${transaction.id}: ${error?.message || 'unknown error'}`)
      continue
    }
    transactionsCount += 1
    if (transaction.type === 'charge' || transaction.type === 'payment') {
      totalSales += Number(record.amount)
    }
    totalFees += Number(record.fee)

    const ledgerResult = await admin.rpc('sync_stripe_ledger_entry', {
      p_stripe_transaction_id: saved.id,
    })
    if (ledgerResult.error) warnings.push(`Could not post Stripe ledger entry ${transaction.id}: ${ledgerResult.error.message}`)

    if ((transaction.type === 'charge' || transaction.type === 'payment') && store.auto_invoice_sales) {
      const invoiceResult = await admin.rpc('create_stripe_sale_invoice', {
        p_stripe_transaction_id: saved.id,
      })
      if (invoiceResult.error) {
        warnings.push(`Could not create invoice for ${transaction.id}: ${invoiceResult.error.message}`)
      } else if (invoiceResult.data) {
        invoicesCreated += 1
      }
    }
  }

  let payoutsCount = 0
  let totalPayouts = 0
  for (const payout of payouts.rows) {
    const record = {
      user_id: store.created_by || null,
      company_id: store.company_id,
      stripe_store_id: store.id,
      stripe_id: payout.id,
      amount: majorUnits(payout.amount),
      currency: (payout.currency || 'eur').toUpperCase(),
      arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10) : null,
      status: payout.status || null,
      method: payout.method || null,
      description: payout.description || null,
      created_at: isoDateTime(payout.created),
      livemode: Boolean(payout.livemode ?? store.livemode),
    }
    const { error } = await admin
      .from('stripe_payouts')
      .upsert(record, { onConflict: 'stripe_store_id,stripe_id' })
    if (error) {
      warnings.push(`Could not save Stripe payout ${payout.id}: ${error.message}`)
      continue
    }
    payoutsCount += 1
    totalPayouts += Number(record.amount)
  }

  const syncedAt = new Date().toISOString()
  await admin
    .from('stripe_stores')
    .update({ last_synced_at: syncedAt, status: 'connected', last_error: null, updated_at: syncedAt })
    .eq('id', store.id)
  if (store.created_by) {
    await admin.from('profiles').update({ stripe_last_synced: syncedAt }).eq('id', store.created_by)
  }

  return {
    storeId: store.id,
    transactionsCount,
    payoutsCount,
    invoicesCreated,
    totalSales,
    totalPayouts,
    totalFees,
    balances: balanceRows,
    truncated: transactions.truncated || payouts.truncated,
    warnings,
  }
}

export async function loadStripeStore(
  admin: SupabaseClient,
  storeId: string,
) {
  const { data, error } = await admin
    .from('stripe_stores')
    .select('*')
    .eq('id', storeId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Stripe store not found')
  const { data: secretRows, error: secretError } = await admin.rpc('get_stripe_store_secret', {
    p_stripe_store_id: storeId,
  })
  if (secretError) throw new Error(secretError.message)
  const secret = Array.isArray(secretRows) ? secretRows[0] : secretRows
  if (!secret?.access_token) throw new Error('Stripe store is not connected')
  return { store: data as StripeStore, accessToken: secret.access_token as string }
}
