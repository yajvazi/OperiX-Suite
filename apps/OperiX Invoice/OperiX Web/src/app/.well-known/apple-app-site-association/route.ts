import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.OPERIX_INVOICE_IOS_TEAM_ID?.trim();
  const bundleId = process.env.OPERIX_INVOICE_IOS_BUNDLE_ID?.trim();
  // Universal links are only served when a mobile app is configured for this deployment.
  if (!teamId || !bundleId) return NextResponse.json({ applinks: { details: [] } });
  return NextResponse.json({
    applinks: {
      details: [{ appID: `${teamId}.${bundleId}`, paths: ["/open/*"] }],
    },
  });
}
