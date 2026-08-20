import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type InvoiceRow = {
  id: string;
  company_id: string;
  user_id: string;
  invoice_number: string | null;
  total_amount: number | null;
  currency: string | null;
};

type MembershipRow = {
  user_id: string;
  status: string | null;
};

type PushTokenRow = {
  user_id: string;
  expo_push_token: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: 'Notification service is not configured.' }, 503);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) return json({ error: 'Authentication required.' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const payload = await request.json() as { invoiceId?: string; companyId?: string };
    const invoiceId = String(payload.invoiceId || '');
    const companyId = String(payload.companyId || '');
    if (!invoiceId || !companyId) return json({ error: 'invoiceId and companyId are required.' }, 400);

    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select('id,company_id,user_id,invoice_number,total_amount,currency')
      .eq('id', invoiceId)
      .eq('company_id', companyId)
      .maybeSingle<InvoiceRow>();
    if (invoiceError) throw invoiceError;
    if (!invoice || invoice.user_id !== user.id) return json({ error: 'Invoice access denied.' }, 403);

    const { data: memberships, error: membershipsError } = await admin
      .from('memberships')
      .select('user_id,status')
      .eq('company_id', companyId);
    if (membershipsError) throw membershipsError;

    const recipientIds = (memberships as MembershipRow[] | null || [])
      .filter((membership) => membership.user_id !== user.id && membership.status !== 'revoked')
      .map((membership) => membership.user_id);
    if (!recipientIds.length) return json({ sent: 0, reason: 'No other active tenant agents.' });

    const { data: tokenRows, error: tokenError } = await admin
      .from('operix_push_device_tokens')
      .select('user_id,expo_push_token')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .in('user_id', recipientIds);
    if (tokenError) throw tokenError;

    const uniqueTokens = Array.from(new Map(
      (tokenRows as PushTokenRow[] | null || []).map((row) => [row.expo_push_token, row]),
    ).values());
    if (!uniqueTokens.length) return json({ sent: 0, reason: 'No registered recipient devices.' });

    const { data: creatorProfile } = await admin
      .from('profiles')
      .select('first_name,last_name,email')
      .eq('id', user.id)
      .maybeSingle();
    const creatorName = [creatorProfile?.first_name, creatorProfile?.last_name]
      .filter(Boolean)
      .join(' ')
      || creatorProfile?.email
      || 'An agent';
    const invoiceLabel = invoice.invoice_number || invoice.id.slice(0, 8);
    const amount = Number(invoice.total_amount);
    const amountLabel = Number.isFinite(amount)
      ? ` · ${amount.toFixed(2)} ${invoice.currency || 'EUR'}`
      : '';
    const messages = uniqueTokens.map((row) => ({
      to: row.expo_push_token,
      sound: 'default',
      title: 'New invoice · Faturë e re',
      body: `${creatorName} created invoice ${invoiceLabel}${amountLabel}`,
      data: { type: 'invoice_created', invoiceId: invoice.id, companyId },
    }));

    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    const sentTokens: string[] = [];
    const invalidTokens: string[] = [];
    for (const messageBatch of chunk(messages, 100)) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
        },
        body: JSON.stringify(messageBatch),
      });
      if (!response.ok) throw new Error(`Expo push service returned ${response.status}.`);
      const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
      (result.data || []).forEach((ticket, index) => {
        const token = messageBatch[index]?.to;
        if (!token) return;
        if (ticket.status === 'ok') sentTokens.push(token);
        else if (ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(token);
      });
    }

    if (invalidTokens.length) {
      await admin
        .from('operix_push_device_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .in('expo_push_token', invalidTokens);
    }

    return json({ sent: sentTokens.length, recipients: uniqueTokens.length });
  } catch (error) {
    console.error('invoice-created-notification failed', error);
    return json({ error: error instanceof Error ? error.message : 'Unable to send invoice notification.' }, 500);
  }
});
