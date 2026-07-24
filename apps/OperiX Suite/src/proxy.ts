import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_COOKIE, verifyPreviewSession } from "@/lib/preview-auth";

const PUBLIC_PATHS = new Set(["/", "/en", "/al", "/preview-login"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/api/preview-login") ||
    pathname.startsWith("/api/preview-logout")
  ) {
    const response = NextResponse.next();
    if (pathname === "/preview-login") response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  if (verifyPreviewSession(request.cookies.get(PREVIEW_COOKIE)?.value)) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  const loginUrl = new URL("/preview-login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|asset4.svg|brand/|robots.txt|sitemap.xml|opengraph-image).*)"],
};
