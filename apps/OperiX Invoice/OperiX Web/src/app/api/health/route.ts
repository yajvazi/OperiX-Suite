import { NextResponse } from "next/server";
import { readCrmFlags } from "@/lib/crm/flags";

export function GET() {
  const flags = readCrmFlags();
  return NextResponse.json({
    status: "ok",
    service: "operix-invoice-web",
    time: new Date().toISOString(),
    crmIntegration: {
      enabled: flags.enabled,
      webhooksEnabled: flags.webhooksEnabled,
      customerSyncEnabled: flags.syncCustomers,
      draftCreationEnabled: flags.createDraftOnWon,
      deepLinksEnabled: flags.deepLinksEnabled,
      serverCredentialsConfigured: Boolean(process.env.OPERIX_TWENTY_API_KEY && process.env.OPERIX_TWENTY_WEBHOOK_SECRET),
    },
  }, { headers: { "cache-control": "no-store" } });
}
