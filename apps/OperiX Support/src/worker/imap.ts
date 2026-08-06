import { ImapFlow } from "imapflow";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "../lib/secrets";
import { logEvent } from "../lib/logger";
import { processIncomingRawEmail } from "./incoming";

type Mailbox = { id: string; company_id: string; department_id: string | null; address: string; display_name: string; ticket_prefix: string; source_application: string; reply_to: string | null; default_signature: string | null; imap_host: string | null; imap_port: number; imap_username: string | null; imap_password_ciphertext: string | null; imap_tls_mode: string; sync_mode: string; sync_interval_seconds: number };
type SyncState = { mailbox_id: string; uid_validity: number | null; last_uid: number; last_synced_at: string | null };

function dbRows<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function wait(milliseconds: number, signal: AbortSignal): Promise<void> { return new Promise((resolve) => { const timer = setTimeout(resolve, milliseconds); signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true }); }); }

async function syncMailbox(client: SupabaseClient, mailbox: Mailbox, signal: AbortSignal): Promise<void> {
  if (!mailbox.imap_host || !mailbox.imap_username || !mailbox.imap_password_ciphertext) { logEvent("imap_mailbox_skipped", { mailboxId: mailbox.id, reason: "missing_configuration" }); return; }
  const existingState = await client.from("support_mailbox_sync_state").select("mailbox_id,uid_validity,last_uid,last_synced_at").eq("mailbox_id", mailbox.id).maybeSingle();
  if (existingState.error) { logEvent("imap_sync_state_read_failed", { mailboxId: mailbox.id, error: existingState.error.message }); return; }
  const previousState = existingState.data as SyncState | null;
  if (mailbox.sync_mode === "poll" && previousState?.last_synced_at) {
    const elapsed = Date.now() - new Date(previousState.last_synced_at).getTime();
    if (elapsed < mailbox.sync_interval_seconds * 1000) return;
  }
  const password = decryptSecret(mailbox.imap_password_ciphertext);
  const imap = new ImapFlow({ host: mailbox.imap_host, port: mailbox.imap_port, secure: mailbox.imap_tls_mode === "implicit", auth: { user: mailbox.imap_username, pass: password }, disableAutoIdle: true, maxIdleTime: 15 * 60 * 1000, logger: false });
  try {
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const opened = imap.mailbox;
      if (!opened) throw new Error("IMAP INBOX did not open");
      const state = previousState;
      const uidValidity = Number(opened.uidValidity);
      const initialUid = state?.uid_validity === uidValidity ? Math.max(1, state.last_uid + 1) : 1;
      let lastUid = state?.uid_validity === uidValidity ? state.last_uid : 0;
      if (opened.exists > 0 && initialUid <= opened.uidNext - 1) {
        for await (const message of imap.fetch(`${initialUid}:*`, { source: true, internalDate: true }, { uid: true })) {
          if (signal.aborted) break;
          if (message.source) await processIncomingRawEmail(client, mailbox, message.source, message.uid, uidValidity);
          lastUid = Math.max(lastUid, message.uid);
          await client.from("support_mailbox_sync_state").upsert({ mailbox_id: mailbox.id, uid_validity: uidValidity, last_uid: lastUid, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() });
        }
      }
      await client.from("support_mailbox_sync_state").upsert({ mailbox_id: mailbox.id, uid_validity: uidValidity, last_uid: lastUid, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() });
      if (!signal.aborted && (mailbox.sync_mode === "idle" || mailbox.sync_mode === "webhook")) {
        if (mailbox.sync_mode === "webhook") logEvent("imap_webhook_fallback", { mailboxId: mailbox.id, reason: "webhook_endpoint_not_configured" });
        await Promise.race([imap.idle().then(() => undefined), wait(Math.min(Math.max(mailbox.sync_interval_seconds, 30) * 1000, 60_000), signal)]);
      }
    } finally { lock.release(); }
  } catch (error) {
    await client.from("support_mailbox_sync_state").upsert({ mailbox_id: mailbox.id, last_error: error instanceof Error ? error.message : String(error), updated_at: new Date().toISOString() });
    logEvent("imap_sync_failed", { mailboxId: mailbox.id, error: error instanceof Error ? error.message : String(error) });
  } finally { imap.close(); }
}

export async function syncMailboxes(client: SupabaseClient, signal: AbortSignal): Promise<void> {
  const result = await client.from("support_mailboxes").select("id,company_id,department_id,address,display_name,ticket_prefix,source_application,reply_to,default_signature,imap_host,imap_port,imap_username,imap_password_ciphertext,imap_tls_mode,sync_mode,sync_interval_seconds").eq("is_active", true).is("deleted_at", null);
  if (result.error) { logEvent("imap_mailboxes_failed", { error: result.error.message }); return; }
  for (const mailbox of dbRows<Mailbox>(result.data)) { if (signal.aborted) break; await syncMailbox(client, mailbox, signal); }
}
