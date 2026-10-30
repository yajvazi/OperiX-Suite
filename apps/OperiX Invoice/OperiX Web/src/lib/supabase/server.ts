import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, supabaseAuthCookieName, supabaseKey, supabaseUrl } from "./config";

export async function createClient() {
  if (!isSupabaseConfigured) return null;
  const cookieStore = await cookies();
  const serverSupabaseUrl = process.env.SUPABASE_INTERNAL_URL?.trim() || supabaseUrl;
  return createServerClient(serverSupabaseUrl, supabaseKey, {
    cookieOptions: { name: supabaseAuthCookieName },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components cannot write cookies. */ }
      },
    },
  });
}

/**
 * Like createClient(), but also accepts the mobile app's session as "Authorization: Bearer <access token>".
 * Row-level security still applies: every query runs as that user.
 */
export async function createRequestClient(request: Request) {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1]?.trim();
  if (!token) return createClient();
  if (!isSupabaseConfigured) return null;
  return createSupabaseClient(process.env.SUPABASE_INTERNAL_URL?.trim() || supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
