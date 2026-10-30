"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Download, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PlatformTabs } from "./platform-nav";
import type { EnterpriseContractRow, PlatformBillingAccountRow, PlatformBillingMetric, PlatformOrganizationRow, ProductManualGrantRow, PlatformProductEntitlementRow, PublicApiOverviewRow } from "@/lib/control-types";

export function PlatformAdminView({ organizations, billingAccounts, billingMetrics, enterpriseContracts, manualGrants, productEntitlements, publicApiOverview }: { organizations: PlatformOrganizationRow[]; billingAccounts: PlatformBillingAccountRow[]; billingMetrics: PlatformBillingMetric[]; enterpriseContracts: EnterpriseContractRow[]; manualGrants: ProductManualGrantRow[]; productEntitlements: PlatformProductEntitlementRow[]; publicApiOverview: PublicApiOverviewRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [grantCompanyId, setGrantCompanyId] = useState(billingAccounts[0]?.company_id || organizations[0]?.id || "");
  const [grantProduct, setGrantProduct] = useState("invoice");
  const [grantType, setGrantType] = useState("complimentary");
  const [grantReason, setGrantReason] = useState("");
  const [grantExpires, setGrantExpires] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMessage, setGrantMessage] = useState("");
  const [contractCompanyId, setContractCompanyId] = useState(billingAccounts[0]?.company_id || organizations[0]?.id || "");
  const [contractName, setContractName] = useState("");
  const [contractProducts, setContractProducts] = useState<string[]>(["hr"]);
  const [contractPrice, setContractPrice] = useState("");
  const [contractInterval, setContractInterval] = useState("custom");
  const [contractStarts, setContractStarts] = useState(new Date().toISOString().slice(0, 10));
  const [contractEnds, setContractEnds] = useState("");
  const [contractSeats, setContractSeats] = useState("");
  const [contractTenants, setContractTenants] = useState("");
  const [contractStatus, setContractStatus] = useState("active");
  const [contractTrialStarts, setContractTrialStarts] = useState("");
  const [contractTrialEnds, setContractTrialEnds] = useState("");
  const [contractProductLimits, setContractProductLimits] = useState("");
  const [contractNotes, setContractNotes] = useState("");
  const [contractBusy, setContractBusy] = useState(false);
  const [contractMessage, setContractMessage] = useState("");
  const [apiBusy, setApiBusy] = useState("");
  const [apiMessage, setApiMessage] = useState("");
  const filtered = useMemo(() => organizations.filter((item) => `${item.organization || ""} ${item.plan || ""} ${item.status}`.toLowerCase().includes(query.toLowerCase())), [organizations, query]);
  const workspaceOptions = useMemo(() => {
    const names = new Map(organizations.map((item) => [item.id, item.organization || item.id]));
    billingAccounts.forEach((item) => names.set(item.company_id, item.workspace_name || names.get(item.company_id) || item.company_id));
    return Array.from(names, ([company_id, workspace_name]) => ({ company_id, workspace_name }));
  }, [billingAccounts, organizations]);
  const metric = (name: string) => Number(billingMetrics.find((item) => item.metric === name)?.value || 0);
  const money = (value: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);
  const accessFor = (companyId: string, product: string) => productEntitlements.find((item) => item.company_id === companyId && item.product === product && item.enabled && new Date(item.starts_at).getTime() <= Date.now() && (!item.ends_at || new Date(item.ends_at).getTime() > Date.now()));

  function exportOrganizations() {
    if (!filtered.length) return;
    const columns = ["organization", "plan", "members", "enabled_apps", "status", "created_at"];
    const rows = filtered.map((item) => [item.organization || "", item.plan || "", item.member_count, item.enabled_apps, item.status, item.created_at].map((value) => JSON.stringify(value)).join(","));
    const url = URL.createObjectURL(new Blob([[columns.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "operix-platform-organizations.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  async function createGrant(event: FormEvent) {
    event.preventDefault();
    if (!grantCompanyId || !grantReason.trim()) { setGrantMessage("Choose a workspace and provide an auditable reason."); return; }
    const client = createClient();
    if (!client) { setGrantMessage("The Control client is not configured."); return; }
    setGrantBusy(true); setGrantMessage("");
    const { error } = await client.rpc("control_create_product_manual_grant", { p_company_id: grantCompanyId, p_product: grantProduct, p_grant_type: grantType, p_reason: grantReason.trim(), p_expires_at: grantExpires ? new Date(`${grantExpires}T23:59:59.000Z`).toISOString() : null, p_override_status: "active" });
    setGrantBusy(false);
    if (error) { setGrantMessage(error.message); return; }
    setGrantReason(""); setGrantExpires(""); setGrantMessage(`${grantProduct.toUpperCase()} access grant recorded and audited. Stripe was not changed.`); router.refresh();
  }

  async function createContract(event: FormEvent) {
    event.preventDefault();
    if (!contractCompanyId || !contractName.trim() || !contractProducts.length) { setContractMessage("Choose a workspace, contract name, and at least one enterprise product."); return; }
    const client = createClient();
    if (!client) { setContractMessage("The Control client is not configured."); return; }
    setContractBusy(true); setContractMessage("");
    let productLimits: Record<string, unknown> = {};
    if (contractProductLimits.trim()) {
      try { productLimits = JSON.parse(contractProductLimits) as Record<string, unknown>; } catch { setContractBusy(false); setContractMessage("Product limits must be valid JSON."); return; }
    }
    const { error } = await client.rpc("control_create_enterprise_contract", { p_company_id: contractCompanyId, p_contract_name: contractName.trim(), p_products: contractProducts, p_custom_price: contractPrice ? Number(contractPrice) : null, p_currency: "EUR", p_billing_interval: contractInterval, p_starts_at: new Date(`${contractStarts}T00:00:00.000Z`).toISOString(), p_ends_at: contractEnds ? new Date(`${contractEnds}T23:59:59.000Z`).toISOString() : null, p_status: contractStatus, p_seat_limit: contractSeats ? Number(contractSeats) : null, p_tenant_limit: contractTenants ? Number(contractTenants) : null, p_product_limits: productLimits, p_notes: contractNotes.trim() || null, p_trial_started_at: contractTrialStarts ? new Date(`${contractTrialStarts}T00:00:00.000Z`).toISOString() : null, p_trial_ends_at: contractTrialEnds ? new Date(`${contractTrialEnds}T23:59:59.000Z`).toISOString() : null });
    setContractBusy(false);
    if (error) { setContractMessage(error.message); return; }
    setContractName(""); setContractPrice(""); setContractEnds(""); setContractTrialStarts(""); setContractTrialEnds(""); setContractProductLimits(""); setContractNotes(""); setContractMessage("Enterprise contract recorded, entitlement projection refreshed, and action audited."); router.refresh();
  }

  async function revokeGrant(grant: ProductManualGrantRow) {
    const reason = window.prompt(`Reason for revoking ${grant.product} access?`, "Access no longer required");
    if (!reason?.trim()) return;
    const client = createClient();
    if (!client) return;
    const { error } = await client.rpc("control_revoke_product_manual_grant", { p_grant_id: grant.id, p_reason: reason.trim() });
    if (error) { setGrantMessage(error.message); return; }
    setGrantMessage(`${grant.product.toUpperCase()} grant revoked and audited.`); router.refresh();
  }

  async function revokeContract(contract: EnterpriseContractRow) {
    const reason = window.prompt(`Reason for revoking ${contract.contract_name}?`, "Contract revoked by platform administrator");
    if (!reason?.trim()) return;
    const client = createClient();
    if (!client) return;
    const { error } = await client.rpc("control_revoke_enterprise_contract", { p_contract_id: contract.id, p_reason: reason.trim() });
    if (error) { setContractMessage(error.message); return; }
    setContractMessage("Enterprise contract revoked and audited."); router.refresh();
  }

  async function extendContract(contract: EnterpriseContractRow) {
    const suggested = contract.ends_at ? new Date(contract.ends_at).toISOString().slice(0, 10) : "";
    const value = window.prompt(`New end date for ${contract.contract_name} (YYYY-MM-DD). Leave blank for open-ended access.`, suggested);
    if (value === null) return;
    const trimmed = value.trim();
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) { setContractMessage("Use an ISO date such as 2027-08-24, or leave it blank for open-ended access."); return; }
    const client = createClient();
    if (!client) return;
    const reason = window.prompt("Reason for extending enterprise access?", "Enterprise access renewed by platform administrator");
    if (!reason?.trim()) return;
    const { error } = await client.rpc("control_extend_enterprise_contract", { p_contract_id: contract.id, p_ends_at: trimmed ? new Date(`${trimmed}T23:59:59.000Z`).toISOString() : null, p_reason: reason.trim() });
    if (error) { setContractMessage(error.message); return; }
    setContractMessage("Enterprise contract extended, entitlement projection refreshed, and action audited."); router.refresh();
  }

  async function toggleContractProduct(contract: EnterpriseContractRow, product: "hr" | "desk") {
    const enabled = contract.products.includes(product);
    const reason = window.prompt(`${enabled ? "Disable" : "Enable"} ${product.toUpperCase()} for ${contract.contract_name}?`, enabled ? "Enterprise product access revoked for this contract" : "Enterprise product access added to this contract");
    if (!reason?.trim()) return;
    const client = createClient();
    if (!client) return;
    const { error } = await client.rpc("control_set_enterprise_contract_product", { p_contract_id: contract.id, p_product: product, p_enabled: !enabled, p_reason: reason.trim() });
    if (error) { setContractMessage(error.message); return; }
    setContractMessage(`${product.toUpperCase()} entitlement ${enabled ? "disabled" : "enabled"} and audited.`); router.refresh();
  }

  async function setPublicApiAccess(row: PublicApiOverviewRow, enabled: boolean) {
    const reason = window.prompt(`${enabled ? "Restore" : "Disable"} public API access for ${row.organization}?`, enabled ? "API access restored by platform administrator" : "API access disabled by platform administrator");
    if (!reason?.trim()) return;
    const client = createClient();
    if (!client) return;
    setApiBusy(row.company_id); setApiMessage("");
    const { error } = await client.rpc("control_set_public_api_access", { p_company_id: row.company_id, p_enabled: enabled, p_reason: reason.trim() });
    setApiBusy("");
    if (error) { setApiMessage(error.message); return; }
    setApiMessage(`${row.organization}: public API access ${enabled ? "restored" : "disabled"} and audited.`);
    router.refresh();
  }

  return <main className="platform-page"><header className="platform-header"><div><span className="eyebrow-label">Internal only</span><h1>Platform administration</h1><p>Product subscriptions, enterprise access, revenue, and adoption visibility for authorized OperiX platform administrators.</p></div><div className="platform-header-actions"><span className="platform-protected"><LockKeyhole size={15} />Platform role protected</span><button className="button button-quiet" type="button" onClick={exportOrganizations}><Download size={15} />Export</button></div></header><PlatformTabs active="workspaces" /><div className="callout callout-info"><ShieldCheck size={17} /><span>This surface is separate from customer administration. It does not grant tenant access, reveal secrets, or provide impersonation.</span></div>
    <section className="stat-grid compact-stat-grid"><Metric label="MRR" value={money(metric("mrr"))} /><Metric label="ARR" value={money(metric("arr"))} /><Metric label="Active subscriptions" value={String(metric("active_subscriptions"))} /><Metric label="Invoice / Booking / Suite" value={`${metric("invoice_subscriptions")} / ${metric("booking_subscriptions")} / ${metric("suite_subscriptions")}`} /><Metric label="Active trials" value={String(metric("active_trials"))} /><Metric label="Trial conversion" value={`${metric("trial_conversion_rate").toFixed(1)}%`} /><Metric label="Past due" value={String(metric("past_due_accounts"))} /><Metric label="Enterprise customers" value={String(metric("enterprise_customers"))} /></section>
    <section className="surface-panel table-panel"><div className="table-toolbar"><div><h2>Public API health</h2><p>Owner-only aggregate visibility. API keys and webhook secrets are never exposed here.</p></div></div>{apiMessage ? <p className="form-hint">{apiMessage}</p> : null}<div className="data-table-wrap"><table className="data-table"><thead><tr><th>Workspace</th><th>Add-on / APIs</th><th>Requests this month</th><th>Failures</th><th>Keys / webhooks</th><th>Last request</th><th>Control</th></tr></thead><tbody>{publicApiOverview.map((row) => <tr key={row.company_id}><td><strong>{row.organization}</strong><small>{row.company_id}</small></td><td>{row.api_addon_active ? <span className="text-emerald-700">{row.addon_status}</span> : <span className="text-slate-500">{row.addon_status}</span>}<small>{row.invoice_api_active ? "Invoice" : ""}{row.invoice_api_active && row.booking_api_active ? " · " : ""}{row.booking_api_active ? "Booking" : ""}{!row.invoice_api_active && !row.booking_api_active ? "No product API" : ""}</small></td><td>{Number(row.live_requests || 0).toLocaleString()} live<small>{Number(row.test_requests || 0).toLocaleString()} test</small></td><td>{Number(row.failed_live_requests || 0).toLocaleString()} API<small>{Number(row.webhook_failure_count || 0).toLocaleString()} webhook</small></td><td>{row.active_key_count} keys<small>{row.active_webhook_count} endpoints</small></td><td>{row.last_request_at ? new Date(row.last_request_at).toLocaleString() : "Never"}</td><td><button className={`button button-small ${row.api_addon_active ? "button-danger-quiet" : "button-primary"}`} type="button" disabled={apiBusy === row.company_id} onClick={() => void setPublicApiAccess(row, !row.api_addon_active)}>{apiBusy === row.company_id ? "Saving…" : row.api_addon_active ? "Disable API" : "Restore API"}</button></td></tr>)}</tbody></table>{!publicApiOverview.length ? <div className="empty-state"><ShieldCheck size={22} /><strong>Public API overview unavailable</strong><span>Apply the public API Control migration to enable owner-only status visibility.</span></div> : null}</div></section>
    <section className="surface-panel table-panel"><div className="table-toolbar"><div><h2>Product billing accounts</h2><p>One row per product subscription; Suite is one subscription with shared usage. HR and Desk never appear as public Stripe plans.</p></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Workspace</th><th>Plan</th><th>Product access</th><th>Status</th><th>Usage</th><th>Value</th><th>Renewal</th><th>Stripe IDs</th></tr></thead><tbody>{billingAccounts.map((item) => <tr key={item.id}><td><strong>{item.workspace_name || "Unnamed workspace"}</strong><small>{item.company_id}</small></td><td><strong>{item.plan}</strong></td><td><div className="space-y-1">{(["invoice", "booking", "hr", "desk"] as const).map((product) => { const access = accessFor(item.company_id, product); return <div key={product} className="text-xs"><strong>{product === "hr" || product === "desk" ? product.toUpperCase() : product}</strong> {access ? <span className="text-emerald-700">Active</span> : <span className="text-slate-400">Not enabled</span>}{access?.source ? <small className="ml-1">({access.source})</small> : null}</div>; })}</div></td><td><span className={`status-badge status-badge-${item.status === "active" ? "success" : item.status === "past_due" ? "warning" : "neutral"}`}><span className="status-dot" />{item.status}</span></td><td>{item.total_tenants} tenants · {item.total_users} users<br /><small>{item.billable_tenants} additional tenants · {item.billable_users} additional users</small></td><td>€{Number(item.current_value || 0).toFixed(2)}<small>{item.billing_interval === "annual" ? "/year" : "/month"}</small></td><td>{item.next_renewal_at ? new Date(item.next_renewal_at).toLocaleDateString() : "—"}{item.cancel_at_period_end ? <small>Cancel at period end</small> : null}</td><td><small>{item.stripe_customer_id || "—"}<br />{item.stripe_subscription_id || "—"}</small></td></tr>)}</tbody></table>{!billingAccounts.length ? <div className="empty-state"><ShieldCheck size={22} /><strong>No product billing accounts</strong><span>Accounts appear after a test-mode checkout or trial summary is created.</span></div> : null}</div></section>
    <section className="surface-panel"><div className="panel-header"><div><h2>Manual product access grant</h2><p>Internal promotional or support access only. Every grant requires a reason and is audited; it never silently modifies Stripe.</p></div></div><form className="inline-form" onSubmit={(event) => void createGrant(event)}><label className="field"><span>Workspace</span><select value={grantCompanyId} onChange={(event) => setGrantCompanyId(event.target.value)}><option value="">Choose workspace</option>{workspaceOptions.map((item) => <option key={item.company_id} value={item.company_id}>{item.workspace_name || item.company_id}</option>)}</select></label><label className="field"><span>Product</span><select value={grantProduct} onChange={(event) => setGrantProduct(event.target.value)}><option value="invoice">Invoice</option><option value="booking">Booking</option><option value="suite">Suite</option><option value="hr">HR Enterprise</option><option value="desk">Desk Enterprise</option></select></label><label className="field"><span>Grant type</span><select value={grantType} onChange={(event) => setGrantType(event.target.value)}><option value="complimentary">Complimentary access</option><option value="extended_trial">Extended trial</option><option value="manual_override">Manual override</option></select></label><label className="field"><span>Expires (optional)</span><input type="date" value={grantExpires} onChange={(event) => setGrantExpires(event.target.value)} /></label><label className="field"><span>Reason</span><input required value={grantReason} onChange={(event) => setGrantReason(event.target.value)} placeholder="Partner promotion or support case" /></label><button className="button button-primary" type="submit" disabled={grantBusy}>{grantBusy ? "Recording…" : "Record grant"}</button></form>{grantMessage ? <p className={`form-hint ${grantMessage.includes("audited") ? "" : "form-error"}`}>{grantMessage}</p> : null}<div className="data-table-wrap"><table className="data-table"><thead><tr><th>Workspace</th><th>Product</th><th>Type</th><th>Reason</th><th>Expires</th><th>Action</th></tr></thead><tbody>{manualGrants.map((grant) => <tr key={grant.id}><td><strong>{grant.workspace_name || "Unnamed workspace"}</strong><small>{grant.company_id}</small></td><td>{grant.product}</td><td>{grant.grant_type}<small>{grant.override_status}</small></td><td>{grant.reason}</td><td>{grant.revoked_at ? `Revoked ${new Date(grant.revoked_at).toLocaleDateString()}` : grant.expires_at ? new Date(grant.expires_at).toLocaleDateString() : "Open-ended"}</td><td>{grant.revoked_at ? "—" : <button className="button button-quiet" type="button" onClick={() => void revokeGrant(grant)}>Revoke</button>}</td></tr>)}</tbody></table>{!manualGrants.length ? <div className="empty-state"><ShieldCheck size={22} /><strong>No manual grants</strong><span>Promotional and support access grants will appear here.</span></div> : null}</div></section>
    <section className="surface-panel table-panel"><div className="table-toolbar"><div className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search organizations" /></div><span className="permission-note">{filtered.length} of {organizations.length} organizations</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Organization</th><th>Plan</th><th>Users</th><th>Active apps</th><th>Status</th><th>Created</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.organization || "Unnamed organization"}</strong><small>{item.id}</small></td><td>{item.plan || "—"}</td><td>{item.member_count}</td><td>{item.enabled_apps}</td><td><span className={`status-badge status-badge-${item.status === "active" ? "success" : "warning"}`}><span className="status-dot" />{item.status}</span></td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{!filtered.length ? <div className="empty-state"><Search size={22} /><strong>No organizations match</strong><span>Use a different search term.</span></div> : null}</div></section>
    <section className="surface-panel">
      <div className="panel-header"><div><h2>Enterprise contracts</h2><p>Grant and manage HR or Desk access without exposing public self-service pricing or creating a Stripe subscription.</p></div></div>
      <form className="inline-form" onSubmit={(event) => void createContract(event)}>
        <label className="field"><span>Workspace</span><select value={contractCompanyId} onChange={(event) => setContractCompanyId(event.target.value)}><option value="">Choose workspace</option>{workspaceOptions.map((item) => <option key={item.company_id} value={item.company_id}>{item.workspace_name || item.company_id}</option>)}</select></label>
        <label className="field"><span>Contract name</span><input required value={contractName} onChange={(event) => setContractName(event.target.value)} placeholder="Enterprise agreement" /></label>
        <label className="field"><span>Products</span><span className="checkbox-line"><label><input type="checkbox" checked={contractProducts.includes("hr")} onChange={(event) => setContractProducts((current) => event.target.checked ? Array.from(new Set([...current, "hr"])) : current.filter((product) => product !== "hr"))} />HR</label><label><input type="checkbox" checked={contractProducts.includes("desk")} onChange={(event) => setContractProducts((current) => event.target.checked ? Array.from(new Set([...current, "desk"])) : current.filter((product) => product !== "desk"))} />Desk</label></span></label>
        <label className="field"><span>Contract status</span><select value={contractStatus} onChange={(event) => setContractStatus(event.target.value)}><option value="active">Active</option><option value="trialing">Trial / demo</option><option value="draft">Draft</option></select></label>
        <label className="field"><span>Negotiated price (EUR)</span><input inputMode="decimal" value={contractPrice} onChange={(event) => setContractPrice(event.target.value)} placeholder="Custom" /></label>
        <label className="field"><span>Billing period</span><select value={contractInterval} onChange={(event) => setContractInterval(event.target.value)}><option value="custom">Custom</option><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
        <label className="field"><span>Contract start</span><input type="date" value={contractStarts} onChange={(event) => setContractStarts(event.target.value)} /></label>
        <label className="field"><span>Contract end (optional)</span><input type="date" value={contractEnds} onChange={(event) => setContractEnds(event.target.value)} /></label>
        <label className="field"><span>Trial/demo start</span><input type="date" value={contractTrialStarts} onChange={(event) => setContractTrialStarts(event.target.value)} /></label>
        <label className="field"><span>Trial/demo end</span><input type="date" value={contractTrialEnds} onChange={(event) => setContractTrialEnds(event.target.value)} /></label>
        <label className="field"><span>Seat limit</span><input inputMode="numeric" value={contractSeats} onChange={(event) => setContractSeats(event.target.value)} placeholder="Unlimited" /></label>
        <label className="field"><span>Tenant limit</span><input inputMode="numeric" value={contractTenants} onChange={(event) => setContractTenants(event.target.value)} placeholder="Unlimited" /></label>
        <label className="field"><span>Product limits (JSON)</span><input value={contractProductLimits} onChange={(event) => setContractProductLimits(event.target.value)} placeholder='{"hr": {"employees": 500}}' /></label>
        <label className="field"><span>Notes</span><input value={contractNotes} onChange={(event) => setContractNotes(event.target.value)} placeholder="Contract or sales notes" /></label>
        <button className="button button-primary" type="submit" disabled={contractBusy}>{contractBusy ? "Recording…" : "Record enterprise contract"}</button>
      </form>
      {contractMessage ? <p className={`form-hint ${contractMessage.includes("audited") ? "" : "form-error"}`}>{contractMessage}</p> : null}
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Workspace</th><th>Contract</th><th>Products</th><th>Price</th><th>Limits</th><th>Period</th><th>Status</th><th>Action</th></tr></thead><tbody>{enterpriseContracts.map((contract) => <tr key={contract.id}><td><strong>{contract.workspace_name || "Unnamed workspace"}</strong><small>{contract.company_id}</small></td><td>{contract.contract_name}<small>{contract.notes || "—"}</small></td><td>{contract.products.length ? contract.products.join(" · ") : "No products enabled"}</td><td>{contract.custom_price == null ? "Custom" : `${contract.currency} ${contract.custom_price}`}{contract.billing_interval ? <small>{contract.billing_interval}</small> : null}</td><td>{contract.seat_limit == null ? "Unlimited seats" : `${contract.seat_limit} seats`}<small>{contract.tenant_limit == null ? "Unlimited tenants" : `${contract.tenant_limit} tenants`}</small>{contract.product_limits && Object.keys(contract.product_limits).length ? <small>{JSON.stringify(contract.product_limits)}</small> : null}</td><td>{new Date(contract.starts_at).toLocaleDateString()} – {contract.ends_at ? new Date(contract.ends_at).toLocaleDateString() : "Open"}{contract.trial_ends_at ? <small>Trial through {new Date(contract.trial_ends_at).toLocaleDateString()}</small> : null}</td><td>{contract.status}</td><td><div className="flex flex-wrap gap-1"><button className="button button-quiet" type="button" onClick={() => void toggleContractProduct(contract, "hr")}>{contract.products.includes("hr") ? "Disable HR" : "Enable HR"}</button><button className="button button-quiet" type="button" onClick={() => void toggleContractProduct(contract, "desk")}>{contract.products.includes("desk") ? "Disable Desk" : "Enable Desk"}</button><button className="button button-quiet" type="button" onClick={() => void extendContract(contract)}>Extend</button>{contract.status !== "canceled" && <button className="button button-quiet" type="button" onClick={() => void revokeContract(contract)}>Revoke</button>}</div></td></tr>)}</tbody></table>{!enterpriseContracts.length ? <div className="empty-state"><Building2 size={22} /><strong>No enterprise contracts</strong><span>Create an audited HR or Desk contract above.</span></div> : null}</div>
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="stat-card stat-card-blue"><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>Shared product billing metric</small></div></div>; }
