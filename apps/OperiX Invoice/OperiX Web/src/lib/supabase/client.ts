import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "./config";

let client: SupabaseClient | null = null;

export function createClient() {
  if (!isSupabaseConfigured) return null;
  if (!client) client = createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}
