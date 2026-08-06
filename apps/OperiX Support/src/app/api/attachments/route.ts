import { createHash, randomUUID } from "node:crypto";
import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { supportStorageBucket } from "@/lib/supabase/config";

export const runtime = "nodejs";

const MAX_DEFAULT_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf", "text/plain", "application/zip", "application/x-zip-compressed",
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function safeFilename(value: string): string { return value.replace(/[\\/\0\r\n]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 160) || "attachment"; }

export async function POST(request: Request) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.attachmentManage);
    const form = await request.formData();
    const ticketId = String(form.get("ticketId") ?? "");
    const file = form.get("file");
    if (!ticketId || !(file instanceof File)) return Response.json({ error: { code: "invalid_attachment", message: "ticketId and file are required" } }, { status: 400 });
    const maxBytes = Number(process.env.SUPPORT_MAX_ATTACHMENT_BYTES ?? MAX_DEFAULT_BYTES);
    if (!Number.isFinite(maxBytes) || maxBytes < 1) throw new Error("SUPPORT_MAX_ATTACHMENT_BYTES must be a positive number");
    if (file.size < 1 || file.size > maxBytes) return Response.json({ error: { code: "attachment_too_large", message: `Attachments must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB` } }, { status: 413 });
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(contentType)) return Response.json({ error: { code: "unsupported_attachment_type", message: "This attachment type is not supported" } }, { status: 415 });
    const ticketResult = await support.client.from("support_tickets").select("id").eq("company_id", support.companyId).eq("id", ticketId).is("deleted_at", null).maybeSingle();
    if (ticketResult.error) return routeError(ticketResult.error);
    if (!ticketResult.data) return Response.json({ error: { code: "ticket_not_found", message: "Ticket not found" } }, { status: 404 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const attachmentId = randomUUID();
    const filename = safeFilename(file.name);
    const storagePath = `${support.companyId}/${ticketId}/${attachmentId}/${filename}`;
    const upload = await support.client.storage.from(supportStorageBucket).upload(storagePath, bytes, { contentType, upsert: false });
    if (upload.error) return routeError(upload.error);
    const result = await support.client.from("support_attachments").insert({ id: attachmentId, company_id: support.companyId, ticket_id: ticketId, filename, content_type: contentType, byte_size: file.size, storage_path: storagePath, checksum_sha256: checksum, virus_scan_status: "pending", created_by: support.user.id }).select("*").single();
    if (result.error) { await support.client.storage.from(supportStorageBucket).remove([storagePath]); return routeError(result.error); }
    return Response.json({ data: result.data }, { status: 201 });
  } catch (error) { return routeError(error); }
}
