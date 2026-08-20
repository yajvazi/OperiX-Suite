import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "operix-booking-web",
    commit: process.env.OPERIX_COMMIT_SHA ?? "unknown",
    buildTimestamp: process.env.OPERIX_BUILD_TIMESTAMP ?? null,
    timestamp: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}
