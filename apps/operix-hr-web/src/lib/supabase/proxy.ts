import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "./config";

const PUBLIC_ROUTES = ["/login", "/auth", "/api/health"];

function isInvalidRefreshToken(error: unknown) {
  const authError = error as { code?: string; status?: number; message?: string } | null;
  const code = authError?.code?.toLowerCase() ?? "";
  const message = authError?.message?.toLowerCase() ?? "";
  return code === "refresh_token_not_found"
    || code === "refresh_token_already_used"
    || code === "invalid_refresh_token"
    || code === "refresh_token_expired"
    || (authError?.status === 400 && (message.includes("refresh token") || code === "invalid_grant"));
}

function clearAuthCookies(response: NextResponse, request: NextRequest) {
  request.cookies.getAll().forEach(({ name }) => {
    if (!name.startsWith("sb-")) return;
    response.cookies.set(name, "", { expires: new Date(0), maxAge: 0, path: "/" });
  });
  return response;
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const serverSupabaseUrl = process.env.SUPABASE_INTERNAL_URL?.trim() || supabaseUrl;
  const supabase = createServerClient(serverSupabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const publicRoute = PUBLIC_ROUTES.some((route) => request.nextUrl.pathname.startsWith(route));
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (isInvalidRefreshToken(authError)) {
    if (publicRoute) return clearAuthCookies(NextResponse.next({ request }), request);
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    url.searchParams.set("auth", "reset");
    return clearAuthCookies(NextResponse.redirect(url), request);
  }
  if (!user && !publicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }
  return response;
}
