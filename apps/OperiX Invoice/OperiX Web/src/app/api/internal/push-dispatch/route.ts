import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMessages, chunk, readTickets, type PushDeviceToken, type PushOutboxEvent } from "@/lib/push-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function authorized(request: Request) {
  const secret = (process.env.PUSH_DISPATCH_SECRET || process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const given = request.headers.get("x-dispatch-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sends the push notifications the database has queued (public.push_outbox). The database calls this right after it
 * queues something; it can also be called on a schedule as a safety net. Protected by a shared secret.
 */
async function dispatch(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server storage is not configured." }, { status: 503 });

  const { data: claimed, error: claimError } = await admin.rpc("claim_push_outbox", { p_limit: 50 });
  if (claimError) {
    console.error("Push dispatch could not read the queue", claimError.message);
    return NextResponse.json({ error: "Queue unavailable." }, { status: 500 });
  }
  const events = (claimed || []) as PushOutboxEvent[];
  let sent = 0;
  let failed = 0;
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN?.trim()) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN.trim()}`;

  for (const event of events) {
    try {
      const { data: recipients, error: recipientError } = await admin.rpc("push_outbox_recipients", { p_event_id: event.id });
      if (recipientError) throw new Error(recipientError.message);
      const recipientIds = ((recipients || []) as Array<{ user_id: string }>).map((row) => row.user_id);
      if (!recipientIds.length) { await admin.rpc("complete_push_outbox", { p_event_id: event.id, p_error: null }); continue; }

      const { data: tokens, error: tokenError } = await admin.from("operix_push_device_tokens")
        .select("user_id,expo_push_token,language").eq("company_id", event.company_id).eq("is_active", true).in("user_id", recipientIds);
      if (tokenError) throw new Error(tokenError.message);
      const messages = buildMessages(event, (tokens || []) as PushDeviceToken[], recipientIds);

      let lastError: string | null = null;
      let acceptedForEvent = 0;
      for (const batch of chunk(messages, 100)) {
        const response = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(batch) });
        const body = await response.json().catch(() => null) as { data?: Array<{ status?: string; message?: string; details?: { error?: string } }> } | null;
        if (!response.ok) { lastError = `Expo answered ${response.status}`; failed += batch.length; continue; }
        const result = readTickets(batch, body);
        sent += result.accepted;
        acceptedForEvent += result.accepted;
        failed += result.errors.length;
        if (result.errors.length) lastError = result.errors[0];
        // A phone that uninstalled the app or turned notifications off is switched off so we stop trying.
        if (result.invalidTokens.length) await admin.from("operix_push_device_tokens").update({ is_active: false, updated_at: new Date().toISOString() }).in("expo_push_token", result.invalidTokens);
      }
      // If at least one phone got it, do not retry the whole event (the others would get it twice).
      await admin.rpc("complete_push_outbox", { p_event_id: event.id, p_error: acceptedForEvent > 0 ? null : lastError });
    } catch (caught) {
      failed += 1;
      const message = caught instanceof Error ? caught.message : "Unknown error";
      console.error("Push dispatch failed for an event", message);
      await admin.rpc("complete_push_outbox", { p_event_id: event.id, p_error: message });
    }
  }
  return NextResponse.json({ events: events.length, sent, failed }, { headers: { "cache-control": "no-store" } });
}

export const POST = dispatch;
export const GET = dispatch;
