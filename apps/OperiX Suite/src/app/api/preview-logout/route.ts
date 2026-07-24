import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_COOKIE, previewCookieOptions } from "@/lib/preview-auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/en", request.url), 303);
  response.cookies.set(PREVIEW_COOKIE, "", { ...previewCookieOptions, maxAge: 0 });
  return response;
}
