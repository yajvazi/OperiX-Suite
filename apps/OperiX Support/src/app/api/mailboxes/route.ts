import { encryptSecret } from "@/lib/secrets";
import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { mailboxSchema } from "@/lib/validation";

function publicMailbox(value: Record<string, unknown>): Record<string, unknown> { const { imap_password_ciphertext: _imap, smtp_password_ciphertext: _smtp, ...safe } = value; return { ...safe, imapConfigured: Boolean(value.imap_host && value.imap_username && value.imap_password_ciphertext), smtpConfigured: Boolean(value.smtp_host && value.smtp_username && value.smtp_password_ciphertext) }; }

export async function GET() {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.emailManage);
    const result = await support.client.from("support_mailboxes").select("id,company_id,department_id,address,display_name,ticket_prefix,source_application,reply_to,default_signature,sync_mode,sync_interval_seconds,imap_host,imap_port,imap_username,imap_password_ciphertext,imap_tls_mode,smtp_host,smtp_port,smtp_username,smtp_password_ciphertext,smtp_tls_mode,is_active,created_at,updated_at").eq("company_id", support.companyId).is("deleted_at", null).order("address");
    if (result.error) return routeError(result.error);
    return Response.json({ data: (result.data ?? []).map((item) => publicMailbox(item as Record<string, unknown>)) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.emailManage);
    const input = await readJson(request, mailboxSchema);
    const row: Record<string, unknown> = { company_id: support.companyId, department_id: input.departmentId ?? null, address: input.address, display_name: input.displayName, ticket_prefix: input.ticketPrefix, source_application: input.sourceApplication, reply_to: input.replyTo ?? null, default_signature: input.defaultSignature ?? null, sync_mode: input.syncMode, sync_interval_seconds: input.syncIntervalSeconds, created_by: support.user.id, updated_by: support.user.id };
    if (input.imap) { row.imap_host = input.imap.host ?? null; row.imap_port = input.imap.port; row.imap_username = input.imap.username ?? null; row.imap_tls_mode = input.imap.tlsMode; if (input.imap.password) row.imap_password_ciphertext = encryptSecret(input.imap.password); }
    if (input.smtp) { row.smtp_host = input.smtp.host ?? null; row.smtp_port = input.smtp.port; row.smtp_username = input.smtp.username ?? null; row.smtp_tls_mode = input.smtp.tlsMode; if (input.smtp.password) row.smtp_password_ciphertext = encryptSecret(input.smtp.password); }
    const result = await support.client.from("support_mailboxes").insert(row).select("*").single();
    if (result.error) return routeError(result.error);
    return Response.json({ data: publicMailbox(result.data as Record<string, unknown>) }, { status: 201 });
  } catch (error) { return routeError(error); }
}
