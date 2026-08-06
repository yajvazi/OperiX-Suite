import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { supportStorageBucket } from "@/lib/supabase/config";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const support = await getSupportContext(SUPPORT_PERMISSIONS.ticketView);
    const id = (await context.params).id;
    const result = await support.client.from("support_attachments").select("storage_path,filename,content_type").eq("company_id", support.companyId).eq("id", id).maybeSingle();
    if (result.error) return routeError(result.error);
    if (!result.data) return Response.json({ error: { code: "attachment_not_found", message: "Attachment not found" } }, { status: 404 });
    const signed = await support.client.storage.from(supportStorageBucket).createSignedUrl(result.data.storage_path, 300, { download: result.data.filename });
    if (signed.error) return routeError(signed.error);
    return Response.redirect(signed.data.signedUrl);
  } catch (error) { return routeError(error); }
}
