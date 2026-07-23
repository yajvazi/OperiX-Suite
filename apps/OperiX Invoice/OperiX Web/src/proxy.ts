import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host")?.split(":")[0];
  if (hostname === "demo.invoice.operixsuite.com" && !request.nextUrl.pathname.startsWith("/demo")) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.pathname === "/" ? "/demo" : `/demo${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }
  return updateSession(request);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|otf|woff|woff2|ttf)$).*)"] };
