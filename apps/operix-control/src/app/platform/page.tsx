import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EnterpriseContractRow, PlatformBillingAccountRow, PlatformBillingMetric, PlatformOrganizationRow, ProductManualGrantRow, PlatformProductEntitlementRow, PublicApiOverviewRow } from "@/lib/control-types";
import { PlatformAdminView } from "@/components/platform-admin-view";

export const dynamic = "force-dynamic";

function Boundary({ title, body }: { title: string; body: string }) {
  return <main className="boundary-page"><div className="boundary-mark">O</div><p className="boundary-kicker">OPERIX PLATFORM</p><h1>{title}</h1><p>{body}</p></main>;
}

export default async function PlatformPage() {
  const client = await createClient();
  if (!client) return <Boundary title="Platform administration is not configured" body="The shared authentication client could not be initialized." />;
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login?next=/platform");
  const { data: isPlatformAdmin, error: accessError } = await client.rpc("control_is_platform_admin");
  if (accessError) return <Boundary title="Platform contract unavailable" body="The internal platform administration contract is not installed in this environment." />;
  if (isPlatformAdmin !== true) return <Boundary title="Internal access required" body="This surface is restricted to the separate OperiX Platform Admin role." />;
  // Only the platform owner (allowlist in the database) may open the platform pages.
  const { data: ownerAccess } = await client.rpc("platform_dashboard_access");
  if (ownerAccess !== true) return <Boundary title="Internal access required" body="This area is restricted to the OperiX platform owner." />;
  const [organizationsResult, billingAccountsResult, billingMetricsResult, enterpriseContractsResult, manualGrantsResult, productEntitlementsResult, publicApiResult] = await Promise.all([
    client.rpc("control_list_platform_organizations"),
    client.rpc("control_list_product_billing_accounts"),
    client.rpc("control_product_billing_metrics"),
    client.rpc("control_list_enterprise_contracts"),
    client.rpc("control_list_product_manual_grants"),
    client.rpc("control_list_product_entitlements"),
    client.rpc("control_list_public_api_overview"),
  ]);
  if (organizationsResult.error) return <Boundary title="Platform directory unavailable" body="The organization directory could not be loaded." />;
  if (billingAccountsResult.error || billingMetricsResult.error || enterpriseContractsResult.error || manualGrantsResult.error || productEntitlementsResult.error) return <Boundary title="Billing overview unavailable" body="Apply the product-aware subscription migration before opening platform billing metrics." />;
  return <PlatformAdminView organizations={(organizationsResult.data || []) as PlatformOrganizationRow[]} billingAccounts={(billingAccountsResult.data || []) as PlatformBillingAccountRow[]} billingMetrics={(billingMetricsResult.data || []) as PlatformBillingMetric[]} enterpriseContracts={(enterpriseContractsResult.data || []) as EnterpriseContractRow[]} manualGrants={(manualGrantsResult.data || []) as ProductManualGrantRow[]} productEntitlements={(productEntitlementsResult.data || []) as PlatformProductEntitlementRow[]} publicApiOverview={(publicApiResult.data || []) as PublicApiOverviewRow[]} />;
}
