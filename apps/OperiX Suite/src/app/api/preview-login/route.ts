import { NextRequest, NextResponse } from "next/server";
import {
  createPreviewSession,
  PREVIEW_COOKIE,
  previewCookieOptions,
  verifyPreviewCredentials,
} from "@/lib/preview-auth";

function safeNextPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "/en/preview";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/en/preview";
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(formData.get("next"));

  if (!verifyPreviewCredentials(username, password)) {
    const loginUrl = new URL("/preview-login", request.url);
    loginUrl.searchParams.set("error", "invalid");
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl, 303);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set(PREVIEW_COOKIE, createPreviewSession(), previewCookieOptions);
  return response;
}
