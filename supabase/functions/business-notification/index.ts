import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVENT_TYPES = new Set([
  'invoice_created', 'invoice_updated', 'invoice_cancelled', 'invoice_paid',
  'payment_received', 'expense_created', 'expense_approved',
  'money_transferred', 'shared_bank_activity', 'member_added',
  'payment_failed', 'sync_failed', 'approval_requested',
]);

type Row = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function titleFor(eventType: string) {
  const titles: Record<string, string> = {
    invoice_created: 'New invoice · Faturë e re',
    invoice_updated: 'Invoice updated · Fatura u ndryshua',
    invoice_cancelled: 'Invoice cancelled · Fatura u anulua',
    invoice_paid: 'Invoice paid · Fatura u pagua',
    payment_received: 'Payment received · Pagesë e pranuar',
    expense_created: 'New expense · Shpenzim i ri',
    expense_approved: 'Expense approved · Shpenzimi u aprovua',
    money_transferred: 'Money transferred · Para të transferuara',
    shared_bank_activity: 'Shared bank activity · Aktivitet bankar i përbashkët',
    member_added: 'New tenant agent · Agjent i ri në tenant',
    payment_failed: 'Payment failed · Pagesa dështoi',
    sync_failed: 'Synchronization failed · Sinkronizimi dështoi',
    approval_requested: 'Approval requested · Kërkohet aprovim',
  };
  return titles[eventType] || 'OperiX notification';
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
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) return json({ error: 'Notification service is not configured.' }, 503);

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: 'Authentication required.' }, 401);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const payload = await request.json() as {
      eventType?: string;
      companyId?: string;
      entityId?: string | null;
      metadata?: Record<string, unknown>;
    };
    const eventType = String(payload.eventType || '');
    const companyId = String(payload.companyId || '');
    const entityId = payload.entityId ? String(payload.entityId) : null;
    const metadata = payload.metadata || {};
    if (!EVENT_TYPES.has(eventType) || !companyId) return json({ error: 'Invalid notification event.' }, 400);

    const { data: actorMembership } = await admin.from('memberships').select('user_id,status').eq('company_id', companyId).eq('user_id', user.id).maybeSingle();
    if (!actorMembership || actorMembership.status === 'revoked') return json({ error: 'Tenant access denied.' }, 403);

    let subject: Row | null = null;
    let subjectTable = '';
    const entityType = typeof metadata.entityType === 'string' ? metadata.entityType : '';
    if (entityId && (eventType.startsWith('invoice_') || (eventType === 'approval_requested' && entityType === 'invoice'))) subjectTable = 'invoices';
    else if (entityId && (eventType === 'payment_received' || eventType === 'payment_failed' || (eventType === 'shared_bank_activity' && entityType === 'payment'))) subjectTable = 'payments';
    else if (entityId && (eventType === 'expense_created' || eventType === 'expense_approved' || (eventType === 'approval_requested' && entityType === 'expense') || (eventType === 'shared_bank_activity' && entityType === 'expense'))) subjectTable = 'expenses';
    else if (entityId && (eventType === 'money_transferred' || eventType === 'shared_bank_activity')) subjectTable = 'company_fund_transfers';

    if (subjectTable) {
      const { data, error } = await admin.from(subjectTable).select('*').eq('id', entityId).eq('company_id', companyId).maybeSingle();
      if (error) throw error;
      subject = data as Row | null;
      if (!subject) return json({ error: 'Notification subject not found.' }, 404);
      const requiresOwnership = eventType === 'invoice_created'
        || eventType === 'payment_received'
        || eventType === 'expense_created'
        || eventType === 'expense_approved'
        || eventType === 'money_transferred'
        || eventType === 'shared_bank_activity';
      const ownerId = subject.user_id || subject.created_by;
      if (requiresOwnership && ownerId && ownerId !== user.id) return json({ error: 'Notification subject access denied.' }, 403);
      if (eventType === 'invoice_paid') {
        const status = String(subject.status || subject.commercial_status || '').toUpperCase();
        if (!['PAID', 'SETTLED'].includes(status)) return json({ sent: 0, reason: 'Invoice is not paid.' });
      }
    }

    // A shared bank account is physically owned by one tenant. Notify agents in
    // both the tenant that recorded the activity and the account's owner tenant.
    // This keeps the notification fan-out aligned with the shared fund ledger.
    let recipientCompanyIds = [companyId];
    if (eventType === 'shared_bank_activity' && subject?.company_bank_account_id) {
      const { data: bankAccount, error: bankError } = await admin.from('company_bank_accounts')
        .select('company_id').eq('id', String(subject.company_bank_account_id)).maybeSingle();
      if (bankError) throw bankError;
      const ownerCompanyId = bankAccount?.company_id ? String(bankAccount.company_id) : null;
      if (ownerCompanyId && ownerCompanyId !== companyId) {
        const { data: share } = await admin.from('company_bank_account_shares')
          .select('id').eq('company_bank_account_id', String(subject.company_bank_account_id)).eq('shared_company_id', companyId).eq('is_active', true).maybeSingle();
        if (!share) return json({ error: 'Shared bank account access denied.' }, 403);
        recipientCompanyIds = Array.from(new Set([companyId, ownerCompanyId]));
      }
    }
    const { data: memberships, error: membershipsError } = await admin.from('memberships').select('user_id,status').in('company_id', recipientCompanyIds);
    if (membershipsError) throw membershipsError;
    let recipientIds = (memberships || [])
      .filter((membership: Row) => membership.user_id !== user.id && membership.status !== 'revoked')
      .map((membership: Row) => String(membership.user_id));
    recipientIds = Array.from(new Set(recipientIds));
    const { data: settings } = await admin.from('ai_settings').select('user_id,push_notifications_enabled').in('company_id', recipientCompanyIds).in('user_id', recipientIds);
    const disabledUsers = new Set((settings || []).filter((setting: Row) => setting.push_notifications_enabled === false).map((setting: Row) => String(setting.user_id)));
    recipientIds = recipientIds.filter((id) => !disabledUsers.has(id));
    if (!recipientIds.length) return json({ sent: 0 });

    const { data: tokens, error: tokenError } = await admin.from('operix_push_device_tokens')
      .select('user_id,expo_push_token')
      .in('company_id', recipientCompanyIds)
      .eq('is_active', true)
      .in('user_id', recipientIds);
    if (tokenError) throw tokenError;
    const uniqueTokens = Array.from(new Map((tokens || []).map((row: Row) => [row.expo_push_token, row])).values());
    if (!uniqueTokens.length) return json({ sent: 0, recipients: 0 });

    const creator = await admin.from('profiles').select('first_name,last_name,email').eq('id', user.id).maybeSingle();
    const creatorName = [creator.data?.first_name, creator.data?.last_name].filter(Boolean).join(' ') || creator.data?.email || 'An agent';
    const number = String(subject?.invoice_number || subject?.payment_number || subject?.id || metadata.reference || '').slice(0, 48);
    const amount = Number(subject?.total_amount ?? subject?.amount ?? metadata.amount);
    const amountText = Number.isFinite(amount) ? ` · ${amount.toFixed(2)} ${String(subject?.currency || metadata.currency || 'EUR')}` : '';
    const suppliedMessage = typeof metadata.message === 'string' ? metadata.message : '';
    const body = suppliedMessage || `${creatorName}: ${eventType.replaceAll('_', ' ')}${number ? ` ${number}` : ''}${amountText}`;
    const messages = uniqueTokens.map((row: Row) => ({
      to: row.expo_push_token,
      sound: 'default',
      title: titleFor(eventType),
      body,
      data: { type: eventType, entityId, companyId },
    }));

    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    const invalidTokens: string[] = [];
    let sent = 0;
    for (const batch of chunk(messages, 100)) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}) },
        body: JSON.stringify(batch),
      });
      if (!response.ok) throw new Error(`Expo push service returned ${response.status}.`);
      const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
      (result.data || []).forEach((ticket, index) => {
        const token = batch[index]?.to;
        if (ticket.status === 'ok') sent += 1;
        else if (token && ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(token);
      });
    }
    if (invalidTokens.length) await admin.from('operix_push_device_tokens').update({ is_active: false, updated_at: new Date().toISOString() }).in('company_id', recipientCompanyIds).in('expo_push_token', invalidTokens);
    return json({ sent, recipients: uniqueTokens.length });
  } catch (error) {
    console.error('business-notification failed', error);
    return json({ error: error instanceof Error ? error.message : 'Unable to send notification.' }, 500);
  }
});
