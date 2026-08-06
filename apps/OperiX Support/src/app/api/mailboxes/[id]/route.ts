import { encryptSecret } from "@/lib/secrets";
import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { readJson, routeError } from "@/lib/api";
import { mailboxSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.emailManage);
    const id = (await context.params).id;
    const input = await readJson(request, mailboxSchema.partial());
    const update: Record<string, unknown> = { updated_by: support.user.id };
    if (input.address !== undefined) update.address = input.address;
    if (input.displayName !== undefined) update.display_name = input.displayName;
    if (input.ticketPrefix !== undefined) update.ticket_prefix = input.ticketPrefix;
    if (input.sourceApplication !== undefined) update.source_application = input.sourceApplication;
    if (input.departmentId !== undefined) update.department_id = input.departmentId;
    if (input.replyTo !== undefined) update.reply_to = input.replyTo;
    if (input.defaultSignature !== undefined) update.default_signature = input.defaultSignature;
    if (input.syncMode !== undefined) update.sync_mode = input.syncMode;
    if (input.syncIntervalSeconds !== undefined) update.sync_interval_seconds = input.syncIntervalSeconds;
    if (input.imap) { update.imap_host = input.imap.host ?? null; update.imap_port = input.imap.port; update.imap_username = input.imap.username ?? null; update.imap_tls_mode = input.imap.tlsMode; if (input.imap.password) update.imap_password_ciphertext = encryptSecret(input.imap.password); }
    if (input.smtp) { update.smtp_host = input.smtp.host ?? null; update.smtp_port = input.smtp.port; update.smtp_username = input.smtp.username ?? null; update.smtp_tls_mode = input.smtp.tlsMode; if (input.smtp.password) update.smtp_password_ciphertext = encryptSecret(input.smtp.password); }
    const result = await support.client.from("support_mailboxes").update(update).eq("company_id", support.companyId).eq("id", id).is("deleted_at", null).select("*").single();
    if (result.error) return routeError(result.error);
    const safe = { ...result.data as Record<string, unknown> }; delete safe.imap_password_ciphertext; delete safe.smtp_password_ciphertext;
    return Response.json({ data: safe });
  } catch (error) { return routeError(error); }
}
