import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-navigation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const client = await createClient();
    await client?.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
}
