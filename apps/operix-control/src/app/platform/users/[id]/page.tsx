import Link from "next/link";
import { PlatformBoundary, gatePlatform } from "@/lib/platform-access";
import type { PlatformMembership, PlatformUserDetail } from "@/lib/platform-types";
import { PlatformNav } from "@/components/platform-nav";
import { StatusBadge } from "@/components/platform-charts";
import { PlatformCloudAccess } from "@/components/platform-user-access";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function subscriptionText(item: PlatformMembership) {
  const subscription = item.subscription;
  if (!subscription) return "· no subscription record";
  const parts = [subscription.product, subscription.interval, subscription.stripe ? "paid through Stripe" : ""].filter(Boolean).join(" · ");
  const end = subscription.status === "trialing" ? `trial ends ${day(subscription.trial_ends_at)}` : subscription.current_period_end ? `renews ${day(subscription.current_period_end)}` : "";
  return `· ${parts}${end ? ` · ${end}` : ""}`;
}

export default async function PlatformUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gatePlatform(`/platform/users/${id}`);
  if (!gate.ok) return <PlatformBoundary title={gate.title} body={gate.body} />;
  if (!UUID.test(id)) return <PlatformBoundary title="User not found" body="That address does not belong to a user." />;
  const { data, error } = await gate.client.rpc("platform_user_detail", { p_user_id: id });
  if (error || !data) return <PlatformBoundary title="User not found" body="This user could not be loaded." />;
  const detail = data as PlatformUserDetail;
  const { user } = detail;
  // Access is granted per billing workspace (a subsidiary shares its parent's plan), so show one panel per billing workspace.
  const roots = new Map<string, PlatformMembership>();
  detail.memberships.forEach((item) => { const key = item.root_company_id; if (!roots.has(key) || item.is_root) roots.set(key, item); });

  return <main className="platform-page">
    <PlatformNav active="users" email={gate.email} title={user.full_name || user.email} description={user.full_name ? user.email : "OperiX user"} />
    <p style={{ maxWidth: 1320, margin: "0 auto 14px" }}><Link href="/platform/users">← All users</Link></p>

    <section className="stat-grid compact-stat-grid">
      <div className="stat-card stat-card-blue"><div className="stat-copy"><span>Signed up</span><strong>{day(user.created_at)}</strong><small>via {user.provider}{user.email_confirmed_at ? "" : " · email not confirmed"}</small></div></div>
      <div className="stat-card stat-card-blue"><div className="stat-copy"><span>Last sign-in</span><strong>{day(user.last_sign_in_at)}</strong><small>{user.last_sign_in_at ? when(user.last_sign_in_at) : "never"}</small></div></div>
      <div className="stat-card stat-card-blue"><div className="stat-copy"><span>Invoices created</span><strong>{detail.invoices_total}</strong><small>last: {day(detail.last_invoice_at)}</small></div></div>
      <div className="stat-card stat-card-blue"><div className="stat-copy"><span>Workspaces</span><strong>{detail.memberships.length}</strong><small>{detail.devices.filter((device) => device.is_active).length} phone(s) registered</small></div></div>
    </section>

    <section className="surface-panel table-panel"><div className="table-toolbar"><div><h2>Workspaces</h2><p>Where this person is a member.</p></div></div>
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Workspace</th><th>Role</th><th className="num">Members</th><th className="num">Invoices (30 days)</th><th>Cloud access</th><th>Joined</th></tr></thead><tbody>
        {detail.memberships.length ? detail.memberships.map((item) => <tr key={item.company_id}><td><strong>{item.company_name}</strong><small>{item.is_root ? "main workspace" : "part of a group"}</small></td><td>{item.role}{item.status !== "active" ? ` (${item.status})` : ""}</td><td className="num">{item.members}</td><td className="num">{item.invoices_30d}</td><td><StatusBadge status={item.cloud_status} /></td><td>{day(item.joined_at)}</td></tr>) : <tr><td colSpan={6}>Not a member of any workspace yet.</td></tr>}
      </tbody></table></div></section>

    {Array.from(roots.values()).map((item) => <PlatformCloudAccess key={item.root_company_id} rootCompanyId={item.root_company_id} workspaceName={item.is_root ? item.company_name : `${item.company_name} (billing workspace)`} status={item.cloud_status} subscriptionText={subscriptionText(item)} grants={item.grants} />)}

    {detail.devices.length ? <section className="surface-panel table-panel"><div className="table-toolbar"><div><h2>Phones</h2><p>Devices registered for notifications.</p></div></div>
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Platform</th><th>Language</th><th>Last seen</th><th>Status</th></tr></thead><tbody>
        {detail.devices.map((device, index) => <tr key={index}><td>{device.platform || "—"}</td><td>{device.language || "—"}</td><td>{when(device.last_seen_at)}</td><td>{device.is_active ? "active" : "off"}</td></tr>)}
      </tbody></table></div></section> : null}
  </main>;
}
