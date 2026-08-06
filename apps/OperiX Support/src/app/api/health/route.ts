import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET() {
  return Response.json({ status: "ok", service: "operix-support-web", timestamp: new Date().toISOString(), supabaseConfigured: isSupabaseConfigured });
}
