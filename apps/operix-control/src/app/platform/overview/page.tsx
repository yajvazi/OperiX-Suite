import { PlatformBoundary, gatePlatform } from "@/lib/platform-access";
import type { PlatformStats } from "@/lib/platform-types";
import { PlatformNav } from "@/components/platform-nav";
import { BarChart, StatusBadge } from "@/components/platform-charts";

export const dynamic = "force-dynamic";

const money = (value: number, currency = "EUR") => new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(value);
const number = (value: number) => new Intl.NumberFormat("en-IE").format(value);

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="stat-card stat-card-blue"><div className="stat-copy"><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</div></div>;
}

export default async function PlatformOverviewPage() {
  const gate = await gatePlatform("/platform/overview");
  if (!gate.ok) return <PlatformBoundary title={gate.title} body={gate.body} />;
  const { data, error } = await gate.client.rpc("platform_stats");
  if (error || !data) return <PlatformBoundary title="Statistics unavailable" body="The platform statistics could not be loaded." />;
  const stats = data as PlatformStats;
  const cloud = stats.workspaces.by_cloud_status;
  const volume = Object.entries(stats.activity.invoice_volume_30d);

  return <main className="platform-page">
    <PlatformNav active="overview" email={gate.email} title="Platform overview" description="Users, workspaces, subscriptions and activity across all of OperiX." />

    <section className="stat-grid compact-stat-grid">
      <Stat label="Users" value={number(stats.users.total)} note={`${number(stats.users.new_7d)} new this week · ${number(stats.users.new_30d)} this month`} />
      <Stat label="Active users (30 days)" value={number(stats.users.active_30d)} note={`${number(stats.users.active_7d)} in the last 7 days`} />
      <Stat label="Workspaces" value={number(stats.workspaces.total)} note={`${number(stats.workspaces.multi_member)} with more than one member`} />
      <Stat label="Paying subscriptions" value={number(stats.subscriptions.paying)} note={`≈ ${money(stats.subscriptions.estimated_mrr_eur)} / month (base plans)`} />
      <Stat label="Granted access" value={number(stats.subscriptions.manual_grants_active)} note="active manual grants" />
      <Stat label="Invoices (30 days)" value={number(stats.activity.invoices_30d)} note={`${number(stats.activity.invoices_total)} in total`} />
    </section>

    <section className="platform-grid-2">
      <div className="surface-panel"><BarChart data={stats.signups_by_day} label="New users per day" /></div>
      <div className="surface-panel"><BarChart data={stats.invoices_by_day} label="Invoices created per day" color="#12b76a" /></div>
    </section>

    <section className="platform-grid-3">
      <div className="surface-panel"><div className="panel-header"><div><h2>OperiX Cloud status</h2><p>Top-level workspaces by their best state.</p></div></div>
        <table className="data-table"><tbody>{["paid", "granted", "trial", "past_due", "expired", "none"].map((status) => <tr key={status}><td><StatusBadge status={status} /></td><td className="num">{number(cloud[status] || 0)}</td></tr>)}</tbody></table></div>
      <div className="surface-panel"><div className="panel-header"><div><h2>Sign-in methods</h2><p>How people created their accounts.</p></div></div>
        <table className="data-table"><tbody>{Object.entries(stats.users.providers).sort((a, b) => b[1] - a[1]).map(([provider, total]) => <tr key={provider}><td>{provider}</td><td className="num">{number(total)}</td></tr>)}</tbody></table>
        {stats.users.unconfirmed ? <p className="form-hint">{number(stats.users.unconfirmed)} account(s) have not confirmed their email.</p> : null}</div>
      <div className="surface-panel"><div className="panel-header"><div><h2>Phones and push</h2><p>Registered devices and notifications.</p></div></div>
        <table className="data-table"><tbody>
          <tr><td>Active phones</td><td className="num">{number(stats.devices.active)}</td></tr>
          {Object.entries(stats.devices.by_platform).map(([platform, total]) => <tr key={platform}><td>&nbsp;&nbsp;{platform}</td><td className="num">{number(total)}</td></tr>)}
          <tr><td>Notifications sent (7 days)</td><td className="num">{number(stats.devices.push_sent_7d)}</td></tr>
          <tr><td>Waiting to be sent</td><td className="num">{number(stats.devices.push_pending)}</td></tr>
        </tbody></table></div>
    </section>

    <section className="platform-grid-2">
      <div className="surface-panel table-panel"><div className="table-toolbar"><div><h2>Subscriptions</h2><p>All subscription records by product and status.</p></div></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Status</th><th className="num">Workspaces</th></tr></thead><tbody>
          {stats.subscriptions.by_status.length ? stats.subscriptions.by_status.map((row) => <tr key={`${row.product}-${row.status}`}><td>{row.product}</td><td><StatusBadge status={row.status} /></td><td className="num">{number(row.count)}</td></tr>) : <tr><td colSpan={3}>No subscriptions yet.</td></tr>}
        </tbody></table></div></div>
      <div className="surface-panel table-panel"><div className="table-toolbar"><div><h2>Most active workspaces</h2><p>Invoices created in the last 30 days.</p></div></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Workspace</th><th className="num">Invoices</th></tr></thead><tbody>
          {stats.top_workspaces_30d.length ? stats.top_workspaces_30d.map((row) => <tr key={row.company_id}><td>{row.name}</td><td className="num">{number(row.invoices)}</td></tr>) : <tr><td colSpan={2}>No invoices in the last 30 days.</td></tr>}
        </tbody></table></div></div>
    </section>

    <section className="platform-grid-3">
      <Stat label="Payments (30 days)" value={number(stats.activity.payments_30d)} />
      <Stat label="Expenses (30 days)" value={number(stats.activity.expenses_30d)} />
      <Stat label="Customers / products stored" value={`${number(stats.activity.customers_total)} / ${number(stats.activity.products_total)}`} note={volume.length ? `Invoiced in 30 days: ${volume.map(([currency, total]) => money(total, currency)).join(" · ")}` : "No issued invoices in 30 days"} />
    </section>
    <p className="form-hint" style={{ maxWidth: 1320, margin: "10px auto 0" }}>Updated {new Date(stats.generated_at).toLocaleString("en-GB")}. The monthly figure is an estimate from base plan prices; extra users and businesses are not included.</p>
  </main>;
}
