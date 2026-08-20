import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "./config";

export async function createClient() {
  if (!isSupabaseConfigured) return null;
  const cookieStore = await cookies();
  const serverSupabaseUrl = process.env.SUPABASE_INTERNAL_URL?.trim() || supabaseUrl;
  return createServerClient(serverSupabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components cannot write cookies. */ }
      },
    },
  });
}
