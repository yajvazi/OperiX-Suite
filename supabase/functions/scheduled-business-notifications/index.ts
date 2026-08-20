import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

type Row = Record<string, unknown>;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function utcDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function sendScheduledEvent(admin: ReturnType<typeof createClient>, input: { companyId: string; eventKey: string; type: string; title: string; body: string; entityId?: string }) {
  const { data: memberships, error: membershipError } = await admin.from('memberships').select('user_id,status').eq('company_id', input.companyId);
  if (membershipError) throw membershipError;
  let recipientIds = (memberships || []).filter((row: Row) => row.status !== 'revoked').map((row: Row) => String(row.user_id));
  const { data: settings } = await admin.from('ai_settings').select('user_id,push_notifications_enabled').eq('company_id', input.companyId).in('user_id', recipientIds);
  const disabledUsers = new Set((settings || []).filter((row: Row) => row.push_notifications_enabled === false).map((row: Row) => String(row.user_id)));
  recipientIds = recipientIds.filter((id) => !disabledUsers.has(id));
  if (!recipientIds.length) return 0;

  const { data: existing, error: existingError } = await admin.from('operix_notification_delivery_keys')
    .select('user_id').eq('company_id', input.companyId).eq('event_key', input.eventKey).in('user_id', recipientIds);
  if (existingError) throw existingError;
  const existingIds = new Set((existing || []).map((row: Row) => String(row.user_id)));
  const newRecipientIds = recipientIds.filter((id) => !existingIds.has(id));
  if (!newRecipientIds.length) return 0;
  const { error: keyError } = await admin.from('operix_notification_delivery_keys').insert(newRecipientIds.map((userId) => ({ company_id: input.companyId, user_id: userId, event_key: input.eventKey, notification_type: input.type })));
  if (keyError) throw keyError;

  const { data: tokens, error: tokenError } = await admin.from('operix_push_device_tokens')
    .select('expo_push_token').eq('company_id', input.companyId).eq('is_active', true).in('user_id', newRecipientIds);
  if (tokenError) throw tokenError;
  const uniqueTokens = Array.from(new Set((tokens || []).map((row: Row) => String(row.expo_push_token))));
  let sent = 0;
  for (const batch of chunk(uniqueTokens.map((token) => ({ to: token, sound: 'default', title: input.title, body: input.body, data: { type: input.type, entityId: input.entityId || null, companyId: input.companyId } })), 100)) {
    const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`Expo push service returned ${response.status}.`);
    const result = await response.json() as { data?: Array<{ status?: string }> };
    sent += (result.data || []).filter((ticket) => ticket.status === 'ok').length;
  }
  return sent;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) return json({ error: 'Service authorization required.' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return json({ error: 'Supabase URL is not configured.' }, 503);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const today = utcDate();
    const tomorrow = utcDate(1);
    let sent = 0;
    const { data: overdue, error: overdueError } = await admin.from('invoices')
      .select('id,company_id,invoice_number,total_amount,currency,due_date')
      .lt('due_date', today)
      .not('status', 'in', '(paid,cancelled,credited,reversed)')
      .not('commercial_status', 'in', '(PAID,CANCELLED,CREDITED,REVERSED)');
    if (overdueError) throw overdueError;
    for (const invoice of overdue || []) {
      sent += await sendScheduledEvent(admin, {
        companyId: String(invoice.company_id),
        eventKey: `invoice-overdue:${invoice.id}:${today}`,
        type: 'invoice_overdue',
        title: 'Overdue invoice · Faturë e vonuar',
        body: `Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)} is overdue · ${Number(invoice.total_amount || 0).toFixed(2)} ${invoice.currency || 'EUR'}`,
        entityId: String(invoice.id),
      });
    }

    const { data: dueSoon, error: dueError } = await admin.from('invoices')
      .select('id,company_id,invoice_number,total_amount,currency,due_date')
      .eq('due_date', tomorrow)
      .not('status', 'in', '(paid,cancelled,credited,reversed)')
      .not('commercial_status', 'in', '(PAID,CANCELLED,CREDITED,REVERSED)');
    if (dueError) throw dueError;
    for (const invoice of dueSoon || []) {
      sent += await sendScheduledEvent(admin, {
        companyId: String(invoice.company_id),
        eventKey: `invoice-due-soon:${invoice.id}:${today}`,
        type: 'invoice_due_soon',
        title: 'Invoice due soon · Fatura skadon së shpejti',
        body: `Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)} is due tomorrow · ${Number(invoice.total_amount || 0).toFixed(2)} ${invoice.currency || 'EUR'}`,
        entityId: String(invoice.id),
      });
    }

    const { data: lowStock, error: stockError } = await admin.from('products')
      .select('id,company_id,name,stock_quantity,low_stock_threshold')
      .eq('is_active', true);
    if (stockError) throw stockError;
    for (const product of (lowStock || []).filter((row: Row) => Number(row.stock_quantity || 0) <= Number(row.low_stock_threshold || 5))) {
      sent += await sendScheduledEvent(admin, {
        companyId: String(product.company_id),
        eventKey: `low-stock:${product.id}:${today}`,
        type: 'low_stock',
        title: 'Low stock · Stok i ulët',
        body: `${product.name || 'A product'} has low stock (${Number(product.stock_quantity || 0)} remaining).`,
        entityId: String(product.id),
      });
    }

    const { data: companies, error: companyError } = await admin.from('companies').select('id,company_name,currency');
    if (companyError) throw companyError;
    for (const company of companies || []) {
      const companyId = String(company.id);
      const { count: invoiceCount } = await admin.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('issue_date', today);
      const { count: paymentCount } = await admin.from('payments').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('payment_date', today);
      sent += await sendScheduledEvent(admin, {
        companyId,
        eventKey: `daily-summary:${today}`,
        type: 'daily_summary',
        title: 'Daily business summary · Përmbledhje ditore',
        body: `${company.company_name || 'Your tenant'}: ${invoiceCount || 0} invoices and ${paymentCount || 0} payments today.`,
      });
    }
    return json({ sent, date: today });
  } catch (error) {
    console.error('scheduled-business-notifications failed', error);
    return json({ error: error instanceof Error ? error.message : 'Unable to generate scheduled notifications.' }, 500);
  }
});
