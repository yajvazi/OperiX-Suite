import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readCrmFlags } from "@/lib/crm/flags";
import { verifyInternalApiKey } from "@/lib/crm/security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!verifyInternalApiKey(request.headers.get("x-operix-internal-api-key"), process.env.OPERIX_INTERNAL_API_KEY)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Integration storage is not configured." }, { status: 503 });
  const [events, links] = await Promise.all([
    admin.from("integration_events").select("id,organization_id,event_type,source_entity_type,source_entity_id,status,attempt_count,last_error,created_at,processed_at").order("created_at", { ascending: false }).limit(50),
    admin.from("integration_entity_links").select("id,organization_id,source_system,source_entity_type,source_entity_id,target_system,target_entity_type,target_entity_id,sync_status,last_error,updated_at").order("updated_at", { ascending: false }).limit(50),
  ]);
  const error = events.error || links.error;
  if (error) return NextResponse.json({ error: "Integration status could not be read." }, { status: 503 });
  return NextResponse.json({ flags: readCrmFlags(), events: events.data || [], links: links.data || [] }, { headers: { "cache-control": "no-store" } });
}
