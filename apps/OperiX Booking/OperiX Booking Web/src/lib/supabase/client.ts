import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "./config";

let client: SupabaseClient | null = null;

const PUBLIC_CLIENT_ROUTES = ["/login", "/public"];

function redirectToCleanLogin() {
  if (typeof window === "undefined" || PUBLIC_CLIENT_ROUTES.some((route) => window.location.pathname.startsWith(route))) return;
  const url = new URL("/login", window.location.origin);
  url.searchParams.set("auth", "reset");
  url.searchParams.set("next", `${window.location.pathname}${window.location.search}`);
  window.location.replace(url.toString());
}

export function createClient() {
  if (!isSupabaseConfigured || typeof window === "undefined") return null;
  if (!client) {
    client = createBrowserClient(supabaseUrl, supabaseKey);
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") redirectToCleanLogin();
    });
  }
  return client;
}
