import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';
import { calendarDateTimeToUtc, parseIcsFeed } from './ics.ts';

type Row = Record<string, unknown>;
type CalendarJob = { id: string; company_id: string; connection_id: string; booking_id?: string | null; job_type: string };
type CalendarConnection = Row & { provider: string; calendar_id?: string | null; staff_id?: string | null; metadata?: Row; account_email?: string | null };
type NotificationRow = Row & { id: string; channel: string; recipient?: string | null; event_type: string; payload?: Row; attempts?: number };

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array) {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

function emailConfigured() {
  return Boolean(env('BOOKING_NOTIFICATION_SMTP_HOST') && env('BOOKING_NOTIFICATION_SMTP_USER') && env('BOOKING_NOTIFICATION_SMTP_PASS') && env('BOOKING_NOTIFICATION_SMTP_FROM'));
}

function emailAddress(value: string | null | undefined) {
  const candidate = String(value || '').trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate) ? candidate : null;
}

function phoneNumber(value: string | null | undefined) {
  const candidate = String(value || '').trim();
  return /^\+?[1-9][0-9 .()-]{6,24}$/.test(candidate) ? candidate.replace(/[ .()-]/g, '') : null;
}

async function sendEmail(recipient: string, subject: string, content: string) {
  const client = new SmtpClient();
  try {
    const port = Number(env('BOOKING_NOTIFICATION_SMTP_PORT') || '587');
    await client.connectTLS({
      hostname: env('BOOKING_NOTIFICATION_SMTP_HOST'),
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 587,
      username: env('BOOKING_NOTIFICATION_SMTP_USER'),
      password: env('BOOKING_NOTIFICATION_SMTP_PASS'),
    });
    await client.send({ from: env('BOOKING_NOTIFICATION_SMTP_FROM'), to: recipient, subject, content });
  } finally {
    try { await client.close(); } catch { /* best-effort close */ }
  }
}

async function sendSms(recipient: string, body: string) {
  const accountSid = env('TWILIO_ACCOUNT_SID');
  const authToken = env('TWILIO_AUTH_TOKEN');
  const from = env('TWILIO_FROM');
  if (!accountSid || !authToken || !from) throw new Error('SMS delivery is not configured.');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: recipient, From: from, Body: body.slice(0, 1400) }),
  });
  const result = await response.json().catch(() => ({})) as Row;
  if (!response.ok || typeof result.sid !== 'string') throw new Error('SMS delivery was rejected by the provider.');
  return String(result.sid);
}

function notificationContent(row: NotificationRow) {
  const action = (row.payload?.actionConfig || {}) as Row;
  const subject = typeof action.subject === 'string' && action.subject.trim() ? action.subject.trim().slice(0, 180) : `OperiX Booking · ${row.event_type.replaceAll('.', ' ')}`;
  const content = typeof action.message === 'string' && action.message.trim() ? action.message.trim().slice(0, 5000) : `You have a new OperiX Booking notification: ${row.event_type.replaceAll('.', ' ')}.`;
  return { subject, content };
}

async function processWaitlistDeliveries(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc('booking_waitlist_claim_offer_deliveries', { p_limit: 50 });
  if (error) throw error;
  let delivered = 0;
  for (const delivery of (data || []) as Array<Row & { offer_id: string; raw_token: string; recipient?: string | null; starts_at: string; ends_at: string; expires_at: string }>) {
    const recipientEmail = emailAddress(delivery.recipient);
    const recipientPhone = phoneNumber(delivery.recipient);
    try {
      const base = (env('BOOKING_PUBLIC_APP_URL') || 'https://booking.operixsuite.com').replace(/\/$/, '');
      const link = `${base}/waitlist/${encodeURIComponent(String(delivery.offer_id))}?token=${encodeURIComponent(String(delivery.raw_token))}`;
      const subject = 'A booking time is available';
      const content = `A time is available for your waitlist request. Open this secure link to review it: ${link}\n\nThe offer expires at ${String(delivery.expires_at)}.`;
      let providerId: string | null = null;
      if (recipientEmail && emailConfigured()) await sendEmail(recipientEmail, subject, content);
      else if (recipientPhone) providerId = await sendSms(recipientPhone, `${subject}. Review it here: ${link}`);
      else throw new Error('No configured delivery channel for this waitlist offer.');
      await admin.rpc('booking_waitlist_mark_offer_delivered', { p_offer_id: delivery.offer_id });
      await admin.from('booking_notification_log').update({ status: 'sent', provider_message_id: providerId, sent_at: new Date().toISOString(), error_message: null }).eq('delivery_key', `waitlist-offer:${delivery.offer_id}`).eq('status', 'queued');
      delivered += 1;
    } catch (error) {
      await admin.rpc('booking_waitlist_release_offer_delivery', { p_offer_id: delivery.offer_id });
      console.error('waitlist delivery failed', error instanceof Error ? error.message : 'unknown error');
    }
  }
  return delivered;
}

async function processNotificationLog(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc('booking_notification_claim', { p_limit: 50 });
  if (error) throw error;
  let delivered = 0;
  let skipped = 0;
  for (const row of (data || []) as NotificationRow[]) {
    const recipientEmail = emailAddress(row.recipient);
    const recipientPhone = phoneNumber(row.recipient);
    try {
      const content = notificationContent(row);
      let providerId: string | null = null;
      if (row.channel === 'email' && recipientEmail && emailConfigured()) await sendEmail(recipientEmail, content.subject, content.content);
      else if (row.channel === 'sms' && recipientPhone) providerId = await sendSms(recipientPhone, content.content);
      else throw new Error(`No configured transport for ${row.channel}.`);
      await admin.rpc('booking_notification_complete', { p_notification_id: row.id, p_success: true, p_provider_message_id: providerId });
      delivered += 1;
    } catch (error) {
      await admin.rpc('booking_notification_complete', { p_notification_id: row.id, p_success: false, p_error_message: error instanceof Error ? error.message : 'Notification delivery failed.' });
      if ((Number(row.attempts) || 0) >= 8) skipped += 1;
    }
  }
  return { delivered, skipped };
}

async function encryptionKey() {
  const configured = Deno.env.get('BOOKING_CALENDAR_TOKEN_ENCRYPTION_KEY');
  if (!configured) throw new Error('Calendar token encryption is not configured.');
  const raw = /^[0-9a-f]{64}$/i.test(configured) ? Uint8Array.from(configured.match(/.{2}/g)!.map((value) => parseInt(value, 16))) : decodeBase64Url(configured);
  const material = raw.length === 32 ? raw : new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(configured)));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptSecret(value: string) {
  const [version, ivValue, encryptedValue, tagValue] = value.split(':');
  if (version !== 'v1' || !ivValue || !encryptedValue || !tagValue) throw new Error('Calendar credential format is invalid.');
  const encrypted = new Uint8Array([...decodeBase64Url(encryptedValue), ...decodeBase64Url(tagValue)]);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64Url(ivValue), tagLength: 128 }, await encryptionKey(), encrypted);
  return new TextDecoder().decode(decrypted);
}

async function getAccessToken(admin: ReturnType<typeof createClient>, connection: CalendarConnection) {
  const { data: credentials, error } = await admin.from('booking_calendar_credentials').select('access_token_ciphertext,refresh_token_ciphertext,token_expires_at').eq('company_id', String(connection.company_id)).eq('connection_id', String(connection.id)).maybeSingle();
  if (error || !credentials?.access_token_ciphertext) throw new Error('Calendar credentials are unavailable.');
  if (!credentials.token_expires_at || new Date(String(credentials.token_expires_at)).getTime() > Date.now() + 120000) return decryptSecret(String(credentials.access_token_ciphertext));
  if (!credentials.refresh_token_ciphertext) throw new Error('Calendar authorization has expired.');
  const refreshToken = await decryptSecret(String(credentials.refresh_token_ciphertext));
  const provider = String(connection.provider);
  const endpoint = provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const clientId = provider === 'google' ? Deno.env.get('BOOKING_GOOGLE_CLIENT_ID') : Deno.env.get('BOOKING_MICROSOFT_CLIENT_ID');
  const clientSecret = provider === 'google' ? Deno.env.get('BOOKING_GOOGLE_CLIENT_SECRET') : Deno.env.get('BOOKING_MICROSOFT_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Calendar OAuth credentials are not configured.');
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const result = await response.json() as Row;
  if (!response.ok || typeof result.access_token !== 'string') throw new Error('Calendar authorization could not be refreshed.');
  const newAccess = String(result.access_token);
  const newExpiry = new Date(Date.now() + Number(result.expires_in || 3600) * 1000).toISOString();
  const rawKey = Deno.env.get('BOOKING_CALENDAR_TOKEN_ENCRYPTION_KEY') || '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = /^[0-9a-f]{64}$/i.test(rawKey) ? Uint8Array.from(rawKey.match(/.{2}/g)!.map((value) => parseInt(value, 16))) : decodeBase64Url(rawKey);
  const material = keyMaterial.length === 32 ? keyMaterial : new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey)));
  const key = await crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(newAccess)));
  const tag = encrypted.slice(-16);
  const ciphertext = encrypted.slice(0, -16);
  const encoded = `v1:${encodeBase64Url(iv)}:${encodeBase64Url(ciphertext)}:${encodeBase64Url(tag)}`;
  await admin.rpc('booking_calendar_credentials_put', { p_connection_id: String(connection.id), p_access_token_ciphertext: encoded, p_refresh_token_ciphertext: String(credentials.refresh_token_ciphertext), p_token_expires_at: newExpiry, p_encryption_version: 1 });
  return newAccess;
}

async function pullBusy(connection: CalendarConnection, accessToken: string, appleFeedUrl?: string) {
  const provider = String(connection.provider);
  const calendarId = String(connection.calendar_id || 'primary');
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 366).toISOString();
  if (provider === 'google') {
    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ timeMin: from, timeMax: to, items: [{ id: calendarId }] }) });
    const result = await response.json() as Row;
    if (!response.ok) throw new Error('Google Calendar busy periods could not be loaded.');
    const calendar = (result.calendars as Row | undefined)?.[calendarId] as Row | undefined;
    return ((calendar?.busy as Array<Row> | undefined) || []).map((period) => ({ external_event_id: `busy:${period.start}:${period.end}`, starts_at: period.start, ends_at: period.end, all_day: false }));
  }
  if (provider === 'outlook') {
    const endpoint = calendarId === 'primary' ? 'https://graph.microsoft.com/v1.0/me/calendarView' : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView`;
    const response = await fetch(`${endpoint}?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}&$select=id,start,end,isAllDay`, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' } });
    const result = await response.json() as Row;
    if (!response.ok) throw new Error('Microsoft Outlook busy periods could not be loaded.');
    return ((result.value as Array<Row> | undefined) || []).flatMap((event) => {
      const start = (event.start as Row | undefined)?.dateTime;
      const end = (event.end as Row | undefined)?.dateTime;
      if (!start || !end) return [];
      const startDate = calendarDateTimeToUtc(String(start), String((event.start as Row | undefined)?.timeZone || 'UTC'));
      const endDate = calendarDateTimeToUtc(String(end), String((event.end as Row | undefined)?.timeZone || 'UTC'));
      if (!startDate || !endDate || endDate <= startDate) return [];
      return [{ external_event_id: String(event.id || `${start}:${end}`), starts_at: startDate.toISOString(), ends_at: endDate.toISOString(), all_day: Boolean(event.isAllDay) }];
    });
  }
  const icsUrl = appleFeedUrl || (typeof connection.metadata?.icsUrl === 'string' ? connection.metadata.icsUrl : '');
  if (!icsUrl || !/^https:\/\//i.test(icsUrl)) throw new Error('Apple Calendar requires an HTTPS ICS feed URL.');
  const response = await fetch(icsUrl);
  if (!response.ok) throw new Error('Apple Calendar feed could not be loaded.');
  const text = await response.text();
  return parseIcsFeed(text, { from: new Date(from), to: new Date(to) });
}

function bookingEventPayload(booking: Row, provider: string) {
  const start = new Date(String(booking.starts_at));
  const end = new Date(String(booking.ends_at));
  const dateTime = (value: Date) => value.toISOString();
  return { summary: `OperiX Booking · ${String(booking.booking_number || booking.id)}`, description: 'OperiX Booking reservation', start: { dateTime: dateTime(start), timeZone: provider === 'outlook' ? 'UTC' : String(booking.timezone || 'UTC') }, end: { dateTime: dateTime(end), timeZone: provider === 'outlook' ? 'UTC' : String(booking.timezone || 'UTC') } };
}

async function pushBooking(admin: ReturnType<typeof createClient>, connection: CalendarConnection, accessToken: string, booking: Row, remove: boolean) {
  const provider = String(connection.provider);
  const calendarId = String(connection.calendar_id || 'primary');
  const { data: existing } = await admin.from('booking_calendar_events').select('id,external_event_id').eq('company_id', String(connection.company_id)).eq('connection_id', String(connection.id)).eq('booking_id', String(booking.id)).eq('provider', provider).maybeSingle();
  const externalId = existing?.external_event_id ? String(existing.external_event_id) : null;
  if (provider === 'google') {
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    if (remove && externalId) await fetch(`${base}/${encodeURIComponent(externalId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    else if (!remove) {
      const response = await fetch(externalId ? `${base}/${encodeURIComponent(externalId)}` : base, { method: externalId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(bookingEventPayload(booking, provider)) });
      const result = await response.json() as Row;
      if (!response.ok || !result.id) throw new Error('Google Calendar booking event could not be synchronized.');
      await admin.from('booking_calendar_events').upsert({ company_id: String(connection.company_id), booking_id: String(booking.id), connection_id: String(connection.id), provider, external_event_id: String(result.id), sync_status: 'synced', last_synced_at: new Date().toISOString(), metadata: {} }, { onConflict: 'company_id,booking_id,provider,connection_id' });
    }
  } else if (provider === 'outlook') {
    const base = calendarId === 'primary' ? 'https://graph.microsoft.com/v1.0/me/events' : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`;
    if (remove && externalId) await fetch(`${base}/${encodeURIComponent(externalId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    else if (!remove) {
      const response = await fetch(externalId ? `${base}/${encodeURIComponent(externalId)}` : base, { method: externalId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'outlook.timezone="UTC"' }, body: JSON.stringify(bookingEventPayload(booking, provider)) });
      const result = await response.json() as Row;
      if (!response.ok || !result.id) throw new Error('Microsoft Outlook booking event could not be synchronized.');
      await admin.from('booking_calendar_events').upsert({ company_id: String(connection.company_id), booking_id: String(booking.id), connection_id: String(connection.id), provider, external_event_id: String(result.id), sync_status: 'synced', last_synced_at: new Date().toISOString(), metadata: {} }, { onConflict: 'company_id,booking_id,provider,connection_id' });
    }
  } else if (!remove) {
    throw new Error('Apple Calendar supports busy-feed conflict blocking; event push is not available through ICS.');
  }
  if (remove && existing?.id) await admin.from('booking_calendar_events').update({ sync_status: 'deleted', last_synced_at: new Date().toISOString() }).eq('id', existing.id);
}

async function processCalendarJob(admin: ReturnType<typeof createClient>, job: CalendarJob) {
  const { data: connection, error: connectionError } = await admin.from('booking_calendar_connections').select('*').eq('company_id', job.company_id).eq('id', job.connection_id).maybeSingle();
  if (connectionError || !connection || connection.status !== 'connected') return;
  const provider = String(connection.provider);
  const accessToken = provider === 'apple' ? '' : await getAccessToken(admin, connection as CalendarConnection);
  if (job.job_type === 'pull_busy' || job.job_type === 'full_sync') {
    let appleFeedUrl: string | undefined;
    if (provider === 'apple') {
      const { data: credentials, error: credentialError } = await admin.from('booking_calendar_credentials')
        .select('apple_ics_url_ciphertext')
        .eq('company_id', job.company_id)
        .eq('connection_id', job.connection_id)
        .maybeSingle();
      if (credentialError || !credentials?.apple_ics_url_ciphertext) throw new Error('Apple Calendar feed credentials are unavailable.');
      appleFeedUrl = await decryptSecret(String(credentials.apple_ics_url_ciphertext));
    }
    const busy = await pullBusy(connection as CalendarConnection, accessToken, appleFeedUrl);
    await admin.rpc('booking_calendar_sync_set_busy_periods', { p_connection_id: job.connection_id, p_periods: busy });
  }
  if ((job.job_type === 'push_booking' || job.job_type === 'delete_booking') && job.booking_id) {
    const { data: booking } = await admin.from('bookings').select('*').eq('company_id', job.company_id).eq('id', job.booking_id).maybeSingle();
    if (booking) await pushBooking(admin, connection as CalendarConnection, accessToken, booking, job.job_type === 'delete_booking' || String(booking.status) === 'cancelled');
  }
}

async function processAutomationRun(admin: ReturnType<typeof createClient>, run: Row) {
  const actionType = String(run.action_type);
  const companyId = String(run.company_id);
  const customerId = run.customer_id ? String(run.customer_id) : null;
  if (actionType === 'apply_tag' && customerId) {
    const config = (run.action_config || {}) as Row;
    const name = typeof config.tagName === 'string' ? config.tagName.trim() : '';
    if (!name) throw new Error('The automation tag is not configured.');
    const { data: tag, error: tagError } = await admin.from('booking_customer_tags').upsert({ company_id: companyId, name, color: typeof config.color === 'string' ? config.color : '#004FFE' }, { onConflict: 'company_id,name' }).select('id').single();
    if (tagError || !tag) throw tagError || new Error('The automation tag could not be created.');
    const { error: linkError } = await admin.from('booking_customer_tag_links').upsert({ company_id: companyId, customer_id: customerId, tag_id: tag.id }, { onConflict: 'company_id,customer_id,tag_id' });
    if (linkError) throw linkError;
    return;
  }
  const { data: customer } = customerId ? await admin.from('clients').select('email,phone').eq('company_id', companyId).eq('id', customerId).maybeSingle() : { data: null };
  const recipient = customer?.email || customer?.phone || null;
  await admin.from('booking_notification_log').upsert({ company_id: companyId, booking_id: run.booking_id || null, event_type: `automation.${actionType}`, channel: actionType === 'sms' ? 'sms' : actionType === 'push' ? 'push' : actionType === 'in_app' ? 'in_app' : 'email', recipient, delivery_key: `automation-run:${String(run.id)}`, payload: { actionConfig: run.action_config || {}, runId: run.id }, status: 'queued' }, { onConflict: 'company_id,delivery_key,channel' });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey || request.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) return json({ error: 'Service authorization required.' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return json({ error: 'Supabase URL is not configured.' }, 503);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const results = { calendarQueued: 0, calendar: 0, automations: 0, waitlistExpired: 0, waitlistDelivered: 0, notificationsDelivered: 0, notificationsSkipped: 0, membershipsExpired: 0, packagesExpired: 0 };
  try {
    const { data: queuedCalendars } = await admin.rpc('booking_calendar_sync_enqueue_due', { p_limit: 100 });
    results.calendarQueued = Number(queuedCalendars || 0);
    const { data: calendarJobs } = await admin.rpc('booking_calendar_sync_claim_jobs', { p_limit: 50 });
    for (const job of (calendarJobs || []) as CalendarJob[]) {
      try { await processCalendarJob(admin, job); await admin.rpc('booking_calendar_sync_complete_job', { p_job_id: job.id, p_success: true }); results.calendar += 1; }
      catch (error) { await admin.rpc('booking_calendar_sync_complete_job', { p_job_id: job.id, p_success: false, p_error: error instanceof Error ? error.message : 'Calendar synchronization failed.' }); }
    }
    const { data: automationRuns } = await admin.rpc('booking_automation_claim_runs', { p_limit: 50 });
    for (const run of (automationRuns || []) as Row[]) {
      try { await processAutomationRun(admin, run); await admin.rpc('booking_automation_complete_run', { p_run_id: run.id, p_success: true }); results.automations += 1; }
      catch (error) { await admin.rpc('booking_automation_complete_run', { p_run_id: run.id, p_success: false, p_error: error instanceof Error ? error.message : 'Automation failed.' }); }
    }
    const { data: expired } = await admin.rpc('booking_waitlist_expire_offers', { p_limit: 200 });
    results.waitlistExpired = Number(expired || 0);
    results.waitlistDelivered = await processWaitlistDeliveries(admin);
    const notificationResult = await processNotificationLog(admin);
    results.notificationsDelivered = notificationResult.delivered;
    results.notificationsSkipped = notificationResult.skipped;
    const { data: expiredMemberships } = await admin.rpc('booking_membership_expire_due', { p_limit: 500 });
    results.membershipsExpired = Number(expiredMemberships || 0);
    const { data: expiredPackages } = await admin.rpc('booking_package_expire_due', { p_limit: 500 });
    results.packagesExpired = Number(expiredPackages || 0);
    return json(results);
  } catch (error) {
    console.error('booking-platform-worker failed', error);
    return json({ error: error instanceof Error ? error.message : 'Booking platform worker failed.' }, 500);
  }
});
