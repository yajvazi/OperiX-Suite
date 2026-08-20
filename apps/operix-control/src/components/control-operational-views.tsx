"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
  Code2,
  Database,
  Download,
  ExternalLink,
  Globe2,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createApiKey,
  createGroup,
  createWebhook,
  deleteGroup,
  deleteWebhook,
  getBillingOverview,
  getRetentionPolicy,
  getSecurityPolicy,
  getSecuritySummary,
  getStorageSummary,
  getUsageSummary,
  listApiKeys,
  listCompanyMembers,
  listDomains,
  listFeatureFlags,
  listGroupAccess,
  listGroups,
  listIntegrations,
  listMemberSecurity,
  listNotifications,
  listWebhookDeliveries,
  listWebhooks,
  markAllNotificationsRead,
  markNotificationRead,
  refreshWebhookDelivery,
  revokeApiKey,
  revokeMemberSessions,
  rotateApiKey,
  setFeatureFlag,
  setGroupAppAccess,
  setGroupMember,
  setWebhookStatus,
  testWebhook,
  updateRetentionPolicy,
  updateSecurityPolicy,
} from "@/lib/control-data";
import { displayName, formatRelativeTime, roleLabel } from "@/lib/control-registry";
import type {
  ApiKeyRow,
  BillingOverview,
  ControlView,
  DomainRow,
  FeatureFlagRow,
  GroupAccessRow,
  GroupRow,
  IntegrationRow,
  MemberRow,
  MemberSecurityRow,
  NotificationRow,
  SecuritySummary,
  StorageSummary,
  UsageRow,
  WebhookDeliveryRow,
  WebhookRow,
  Workspace,
} from "@/lib/control-types";

type Props = { view: ControlView; companyId: string; workspace: Workspace };

type OperationalData = {
  groups: GroupRow[];
  groupAccess: GroupAccessRow[];
  members: MemberRow[];
  notifications: NotificationRow[];
  apiKeys: ApiKeyRow[];
  webhooks: WebhookRow[];
  integrations: IntegrationRow[];
  usage: UsageRow[];
  storage: StorageSummary | null;
  billing: BillingOverview | null;
  security: SecuritySummary | null;
  memberSecurity: MemberSecurityRow[];
  policy: { require_mfa_admins: boolean; require_mfa_all: boolean; allowed_email_domains: string[]; invitation_policy: string } | null;
  retention: { audit_log_days: number | null; support_attachment_days: number | null; deleted_file_days: number | null; inactive_account_days: number | null } | null;
  flags: FeatureFlagRow[];
  domains: DomainRow[];
};

const emptyData: OperationalData = { groups: [], groupAccess: [], members: [], notifications: [], apiKeys: [], webhooks: [], integrations: [], usage: [], storage: null, billing: null, security: null, memberSecurity: [], policy: null, retention: null, flags: [], domains: [] };

export function OperationalView({ view, companyId, workspace }: Props) {
  const { data, loading, error, reload } = useOperationalData(view, companyId);
  if (loading) return <Frame title={titleFor(view)} description={descriptionFor(view)}><State icon={Loader2} title="Loading" body="Fetching the tenant-scoped Control contract…" spin /></Frame>;
  if (error) return <Frame title={titleFor(view)} description={descriptionFor(view)}><State icon={ShieldAlert} title="Could not load this view" body={error} action={<button className="button button-primary" type="button" onClick={() => void reload()}>Retry</button>} /></Frame>;
  const props = { companyId, workspace, data, reload };
  switch (view) {
    case "teams": return <TeamsView {...props} />;
    case "notifications": return <NotificationsView {...props} />;
    case "api": return <DeveloperView {...props} />;
    case "data": return <DataView {...props} />;
    case "automations": return <AutomationsView {...props} />;
    case "integrations": return <IntegrationsView {...props} />;
    case "billing": return <BillingView {...props} />;
    case "usage": return <UsageView {...props} />;
    case "security": return <SecurityView {...props} />;
    case "status": return <StatusView />;
    default: return <State icon={CircleHelp} title="Not found" body="This Control surface is not available." />;
  }
}

function useOperationalData(view: ControlView, companyId: string) {
  const [data, setData] = useState<OperationalData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const client = createClient();
      if (!client) { setError("Supabase is not configured."); setLoading(false); return; }
      setLoading(true); setError("");
      try {
        const next = { ...emptyData };
        if (view === "teams") {
          [next.groups, next.groupAccess, next.members] = await Promise.all([listGroups(client, companyId), listGroupAccess(client, companyId), listCompanyMembers(client, companyId)]);
        } else if (view === "notifications") next.notifications = await listNotifications(client, companyId);
        else if (view === "api") [next.apiKeys, next.webhooks] = await Promise.all([listApiKeys(client, companyId), listWebhooks(client, companyId)]);
        else if (view === "data") [next.storage, next.retention, next.usage] = await Promise.all([getStorageSummary(client, companyId), getRetentionPolicy(client, companyId), getUsageSummary(client, companyId)]);
        else if (view === "automations") next.flags = await listFeatureFlags(client, companyId);
        else if (view === "integrations") next.integrations = await listIntegrations(client, companyId);
        else if (view === "billing") next.billing = await getBillingOverview(client, companyId);
        else if (view === "usage") [next.usage, next.storage] = await Promise.all([getUsageSummary(client, companyId), getStorageSummary(client, companyId)]);
        else if (view === "security") [next.security, next.memberSecurity, next.policy, next.domains] = await Promise.all([getSecuritySummary(client, companyId), listMemberSecurity(client, companyId), getSecurityPolicy(client, companyId), listDomains(client, companyId)]);
        if (active) setData(next);
      } catch (loadError) { if (active) setError(loadError instanceof Error ? loadError.message : "The Control contract could not be loaded."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [companyId, view, nonce]);
  return { data, loading, error, reload: async () => setNonce((value) => value + 1) };
}

function TeamsView({ data, companyId, workspace, reload }: Omit<Props, "view"> & { data: OperationalData; reload: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const canManage = workspace.permissions.has("teams.manage");
  const selected = data.groups.find((group) => group.id === selectedId) || null;
  const client = createClient();
  async function addGroup(event: React.FormEvent) { event.preventDefault(); if (!client) return; setBusy(true); setError(""); try { await createGroup(client, companyId, name, description); setName(""); setDescription(""); await reload(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The group could not be created."); } finally { setBusy(false); } }
  async function removeGroup(group: GroupRow) { if (!client || !window.confirm(`Delete ${group.name}? Access assignments will be removed.`)) return; setBusy(true); try { await deleteGroup(client, companyId, group.id); setSelectedId(null); await reload(); } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "The group could not be deleted."); } finally { setBusy(false); } }
  async function toggleMember(groupId: string, membershipId: string, enabled: boolean) { if (!client) return; try { await setGroupMember(client, companyId, groupId, membershipId, enabled); await reload(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Group membership could not be changed."); } }
  async function toggleApp(groupId: string, appKey: string, enabled: boolean) { if (!client) return; try { await setGroupAppAccess(client, companyId, groupId, appKey, enabled); await reload(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Group application access could not be changed."); } }
  return <Frame title="Teams & groups" description="Use shared groups to provision application access without duplicating HR departments."><div className="callout callout-info"><Users size={17} /><span>Groups are organization-scoped. Application permissions remain enforced by each product after Control grants access.</span></div>{error ? <Notice kind="error">{error}</Notice> : null}<div className="operational-two-column"><section className="surface-panel table-panel"><Panel title="Shared groups" body="Finance, HR, Reception, and other reusable access groups." action={canManage ? <span className="permission-note">Manage enabled</span> : <span className="permission-note">Read only</span>} />{data.groups.map((group) => <button className={`operational-list-row ${selected?.id === group.id ? "selected" : ""}`} type="button" key={group.id} onClick={() => setSelectedId(group.id)}><span className="operational-icon"><Users size={17} /></span><span><strong>{group.name}</strong><small>{group.description || "No description"}</small></span><span className="row-count">{group.member_count} users · {group.app_count} apps</span></button>)}{!data.groups.length ? <State icon={Users} title="No groups yet" body="Create a shared group to start assigning access." /> : null}</section><section className="surface-panel"><Panel title={selected ? selected.name : "Create a group"} body={selected ? selected.description || "Manage group membership and app access." : "Create a reusable access group."} />{selected ? <><div className="operational-section"><strong>Members</strong>{data.members.map((member) => { const enabled = data.groupAccess.some((row) => row.group_id === selected.id && row.membership_id === member.membership_id); return <label className="check-row" key={member.membership_id}><span><strong>{displayName(member.first_name, member.last_name, member.email)}</strong><small>{member.email || roleLabel(member.role_code)}</small></span><input type="checkbox" checked={enabled} disabled={!canManage} onChange={(event) => void toggleMember(selected.id, member.membership_id, event.target.checked)} /></label>; })}</div><div className="operational-section"><strong>Application access</strong>{workspace.permissions.has("apps.read") ? ["invoice", "hr", "booking", "desk", "support", "crm"].map((appKey) => { const enabled = data.groupAccess.some((row) => row.group_id === selected.id && row.app_key === appKey && row.enabled); return <label className="check-row" key={appKey}><span><strong>OperiX {appKey.charAt(0).toUpperCase() + appKey.slice(1)}</strong><small>Provision group members</small></span><input type="checkbox" checked={enabled} disabled={!canManage} onChange={(event) => void toggleApp(selected.id, appKey, event.target.checked)} /></label>; }) : <p className="form-hint">Apps permission is required to view app assignments.</p>}</div>{canManage ? <button className="button button-danger-quiet" type="button" onClick={() => void removeGroup(selected)} disabled={busy}><Trash2 size={15} />Delete group</button> : null}</> : <form className="dialog-form inline-form" onSubmit={addGroup}><Field label="Group name" value={name} onChange={setName} placeholder="Finance" required /><Field label="Description" value={description} onChange={setDescription} placeholder="People who need finance access" /><button className="button button-primary" type="submit" disabled={!canManage || busy}>{busy ? <Loader2 className="spin" size={15} /> : <Plus size={15} />}Create group</button></form>}</section></div></Frame>;
}

function NotificationsView({ data, companyId, reload }: Omit<Props, "view"> & { data: OperationalData; reload: () => Promise<void> }) {
  const client = createClient();
  async function mark(item: NotificationRow) { if (!client) return; await markNotificationRead(client, companyId, item.id); window.dispatchEvent(new Event("control-notifications-updated")); await reload(); }
  async function markAll() { if (!client) return; await markAllNotificationsRead(client, companyId); window.dispatchEvent(new Event("control-notifications-updated")); await reload(); }
  return <Frame title="Notifications" description="Administrative alerts from Control and connected OperiX services." action={<button className="button button-quiet" type="button" onClick={() => void markAll()}><Check size={15} />Mark all read</button>}><section className="surface-panel notification-list">{data.notifications.map((item) => <article className={`notification-row ${item.read_at ? "read" : ""}`} key={item.id}><span className={`notification-severity severity-${item.severity}`}><Activity size={16} /></span><div><strong>{item.title}</strong><p>{item.body || "A privileged organization event was recorded."}</p><small>{item.source_application || "OperiX"} · {formatRelativeTime(item.created_at)}</small></div>{item.read_at ? <span className="status-badge status-badge-neutral">Read</span> : <button className="button button-quiet button-small" type="button" onClick={() => void mark(item)}>Mark read</button>}{item.href ? <Link className="icon-button" href={item.href} aria-label="Open related resource"><ArrowRight size={16} /></Link> : null}</article>)}{!data.notifications.length ? <State icon={Mail} title="No administrative notifications" body="Security, billing, integration, and organization alerts will appear here." /> : null}</section></Frame>;
}

function DeveloperView({ data, companyId, workspace, reload }: Omit<Props, "view"> & { data: OperationalData; reload: () => Promise<void> }) {
  const [secret, setSecret] = useState(""); const [keyName, setKeyName] = useState(""); const [webhookName, setWebhookName] = useState(""); const [webhookUrl, setWebhookUrl] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null); const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]); const client = createClient(); const canManage = workspace.permissions.has("api.manage");
  async function newKey(event: React.FormEvent) { event.preventDefault(); if (!client) return; try { const result = await createApiKey(client, companyId, keyName, ["invoice.read", "booking.read", "hr.read", "desk.read"], "production"); setSecret(result.secret); setMessage("API key created. Copy it now; it will not be shown again."); setKeyName(""); await reload(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The API key could not be created."); } }
  async function rotate(id: string) { if (!client || !window.confirm("Rotate this API key? Existing clients will stop working.")) return; try { const result = await rotateApiKey(client, companyId, id); setSecret(result.secret); setMessage("API key rotated. Store the new secret securely."); await reload(); } catch (rotateError) { setError(rotateError instanceof Error ? rotateError.message : "The API key could not be rotated."); } }
  async function revoke(id: string) { if (!client || !window.confirm("Revoke this API key? This cannot be undone.")) return; try { await revokeApiKey(client, companyId, id); await reload(); } catch (revokeError) { setError(revokeError instanceof Error ? revokeError.message : "The API key could not be revoked."); } }
  async function newWebhook(event: React.FormEvent) { event.preventDefault(); if (!client) return; try { const result = await createWebhook(client, companyId, webhookName, webhookUrl, ["control.test"], "production"); setSecret(result.secret); setMessage("Webhook created. Copy the signing secret now; it will not be shown again."); setWebhookName(""); setWebhookUrl(""); await reload(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The webhook could not be created."); } }
  async function test(id: string) { if (!client) return; try { const deliveryId = await testWebhook(client, companyId, id); setMessage("Test delivery queued. Refreshing the delivery result…"); window.setTimeout(async () => { if (client) await refreshWebhookDelivery(client, companyId, deliveryId); await reload(); }, 1500); } catch (testError) { setError(testError instanceof Error ? testError.message : "The webhook test could not be queued."); } }
  async function showDeliveries(id: string) { if (!client) return; setSelectedWebhook(id); setDeliveries(await listWebhookDeliveries(client, companyId, id)); }
  return <Frame title="API & webhooks" description="Create scoped developer credentials and inspect delivery outcomes without exposing secrets.">{message ? <Notice kind="success">{message}{secret ? <code className="secret-reveal">{secret}</code> : null}</Notice> : null}{error ? <Notice kind="error">{error}</Notice> : null}<div className="operational-two-column"><section className="surface-panel table-panel"><Panel title="API keys" body="Secrets are returned once at creation or rotation." />{data.apiKeys.map((key) => <div className="operational-list-row" key={key.id}><span className="operational-icon"><KeyRound size={17} /></span><span><strong>{key.name}</strong><small>{key.key_prefix} · {key.environment} · {key.scopes.join(", ") || "No scopes"}</small></span><span className="row-count">{key.revoked_at ? "Revoked" : key.expires_at ? `Expires ${new Date(key.expires_at).toLocaleDateString()}` : "Active"}</span>{canManage ? <><button className="icon-button" type="button" aria-label="Rotate API key" onClick={() => void rotate(key.id)}><RefreshCw size={15} /></button><button className="icon-button" type="button" aria-label="Revoke API key" onClick={() => void revoke(key.id)}><Trash2 size={15} /></button></> : null}</div>)}{!data.apiKeys.length ? <State icon={KeyRound} title="No API keys" body="Create a scoped key for an integration or internal service." /> : null}{canManage ? <form className="inline-form" onSubmit={newKey}><Field label="Key name" value={keyName} onChange={setKeyName} placeholder="Reporting service" required /><button className="button button-primary" type="submit"><Plus size={15} />Create API key</button></form> : null}</section><section className="surface-panel table-panel"><Panel title="Webhook endpoints" body="HTTPS endpoints with Vault-backed signing secrets." />{data.webhooks.map((hook) => <div className="operational-list-row" key={hook.id}><span className="operational-icon"><Webhook size={17} /></span><span><strong>{hook.name}</strong><small>{hook.endpoint_url} · {hook.secret_prefix}</small></span><span className="row-count">{hook.status} · {hook.success_count}/{hook.success_count + hook.failure_count || 0} success</span>{canManage ? <><button className="button button-quiet button-small" type="button" onClick={() => void test(hook.id)}>Test</button><button className="button button-quiet button-small" type="button" onClick={() => void setWebhookStatus(client!, companyId, hook.id, hook.status === "active" ? "disabled" : "active").then(reload)}>{hook.status === "active" ? "Disable" : "Enable"}</button><button className="icon-button" type="button" aria-label="Delete webhook" onClick={() => { if (client && window.confirm("Delete this webhook endpoint?")) void deleteWebhook(client, companyId, hook.id).then(reload); }}><Trash2 size={15} /></button></> : null}<button className="icon-button" type="button" aria-label="View webhook deliveries" onClick={() => void showDeliveries(hook.id)}><ArrowRight size={15} /></button></div>)}{!data.webhooks.length ? <State icon={Webhook} title="No webhook endpoints" body="Create one for signed administrative events." /> : null}{canManage ? <form className="inline-form" onSubmit={newWebhook}><Field label="Name" value={webhookName} onChange={setWebhookName} placeholder="Operations webhook" required /><Field label="HTTPS endpoint" value={webhookUrl} onChange={setWebhookUrl} placeholder="https://example.com/hooks/operix" required /><button className="button button-primary" type="submit"><Plus size={15} />Create webhook</button></form> : null}{selectedWebhook ? <div className="delivery-panel"><strong>Recent deliveries</strong>{deliveries.map((delivery) => <div className="delivery-row" key={delivery.id}><span>{delivery.event_name}</span><span>{delivery.status_code || "—"}</span><span>{delivery.status}</span><small>{formatRelativeTime(delivery.created_at)}</small></div>)}</div> : null}</section></div></Frame>;
}

function DataView({ data, companyId, workspace, reload }: Omit<Props, "view"> & { data: OperationalData; reload: () => Promise<void> }) {
  const [form, setForm] = useState({ auditLogDays: data.retention?.audit_log_days || 0, supportAttachmentDays: data.retention?.support_attachment_days || 0, deletedFileDays: data.retention?.deleted_file_days || 0, inactiveAccountDays: data.retention?.inactive_account_days || 0 }); const [message, setMessage] = useState(""); const client = createClient(); const canManage = workspace.permissions.has("settings.manage");
  useEffect(() => { setForm({ auditLogDays: data.retention?.audit_log_days || 0, supportAttachmentDays: data.retention?.support_attachment_days || 0, deletedFileDays: data.retention?.deleted_file_days || 0, inactiveAccountDays: data.retention?.inactive_account_days || 0 }); }, [data.retention]);
  async function save() { if (!client) return; await updateRetentionPolicy(client, companyId, { auditLogDays: form.auditLogDays || null, supportAttachmentDays: form.supportAttachmentDays || null, deletedFileDays: form.deletedFileDays || null, inactiveAccountDays: form.inactiveAccountDays || null }); setMessage("Retention policy saved. No destructive cleanup was run."); await reload(); }
  function exportUsage() { downloadCsv("operix-usage.csv", data.usage.map((row) => ({ metric: row.metric, value: row.value, source: row.source }))); }
  return <Frame title="Data & storage" description="Measured storage metadata, safe exports, and non-destructive retention settings.">{message ? <Notice kind="success">{message}</Notice> : null}<div className="stat-grid compact-stat-grid"><Metric label="Stored files" value={data.storage?.object_count == null ? "—" : String(data.storage.object_count)} detail={data.storage?.source || "No storage prefix data"} icon={Database} /><Metric label="Storage" value={data.storage ? formatBytes(data.storage.bytes) : "—"} detail={data.storage?.measured ? "Measured from storage metadata" : "Not measured"} icon={Database} /><Metric label="Measured metrics" value={String(data.usage.filter((row) => row.measured).length)} detail="Real product counts" icon={Activity} /></div><div className="operational-two-column"><section className="surface-panel"><Panel title="Retention policies" body="Values are stored for future jobs; Control never deletes data silently." /><div className="form-grid"><NumberField label="Audit logs (days)" value={form.auditLogDays} onChange={(value) => setForm({ ...form, auditLogDays: value })} /><NumberField label="Support attachments (days)" value={form.supportAttachmentDays} onChange={(value) => setForm({ ...form, supportAttachmentDays: value })} /><NumberField label="Deleted files (days)" value={form.deletedFileDays} onChange={(value) => setForm({ ...form, deletedFileDays: value })} /><NumberField label="Inactive accounts (days)" value={form.inactiveAccountDays} onChange={(value) => setForm({ ...form, inactiveAccountDays: value })} /></div><button className="button button-primary" type="button" disabled={!canManage} onClick={() => void save()}><Check size={15} />Save policy</button></section><section className="surface-panel"><Panel title="Organization exports" body="CSV exports contain only the records this Control role can read." /><button className="button button-quiet" type="button" onClick={exportUsage}><Download size={15} />Export usage CSV</button><Link className="button button-quiet" href="/audit"><Download size={15} />Export audit from Audit Log</Link><p className="form-hint">Invoices, payroll, and other business records remain exportable from their owning applications.</p></section></div></Frame>;
}

function AutomationsView({ data, companyId, workspace, reload }: Omit<Props, "view"> & { data: OperationalData; reload: () => Promise<void> }) {
  const [flag, setFlag] = useState(""); const client = createClient(); const canManage = workspace.permissions.has("settings.manage");
  async function toggle(item: FeatureFlagRow) { if (!client) return; await setFeatureFlag(client, companyId, item.flag, !item.enabled, item.configuration); await reload(); }
  async function create(event: React.FormEvent) { event.preventDefault(); if (!client || !flag.trim()) return; await setFeatureFlag(client, companyId, flag.trim(), false, {}); setFlag(""); await reload(); }
  return <Frame title="Automations" description="Manage typed organization feature flags that coordinate supported cross-app behavior."><div className="callout callout-info"><Activity size={17} /><span>Only registered or explicitly created flags are shown. A flag does not replace product-owned workflow rules.</span></div><section className="surface-panel table-panel"><Panel title="Organization feature flags" body="Changes are tenant-scoped and audited." />{data.flags.map((item) => <div className="operational-list-row" key={item.flag}><span className="operational-icon"><Activity size={17} /></span><span><strong>{item.flag}</strong><small>{JSON.stringify(item.configuration)}</small></span><StatusBadge label={item.enabled ? "Enabled" : "Disabled"} tone={item.enabled ? "success" : "neutral"} /><button className="button button-quiet button-small" type="button" disabled={!canManage} onClick={() => void toggle(item)}>{item.enabled ? "Disable" : "Enable"}</button></div>)}{!data.flags.length ? <State icon={Activity} title="No feature flags configured" body="Create a typed organization flag only when a product consumes it." /> : null}{canManage ? <form className="inline-form" onSubmit={create}><Field label="Flag key" value={flag} onChange={setFlag} placeholder="booking.waitlist_enabled" required /><button className="button button-primary" type="submit"><Plus size={15} />Add disabled flag</button></form> : null}</section></Frame>;
}

function IntegrationsView({ data }: Omit<Props, "view"> & { data: OperationalData }) {
  return <Frame title="Integrations" description="Actual shared and product-owned connection state, with secrets kept server-side."><div className="integration-grid operational-integration-grid">{data.integrations.map((item) => <section className="surface-panel integration-card" key={`${item.provider}-${item.category}`}><div className="integration-card-top"><span className="integration-icon"><Link2 size={20} /></span><div><span className="eyebrow-label">{item.category}</span><h2>{item.display_name}</h2></div><StatusBadge label={item.status} tone={item.status === "Connected" ? "success" : item.status === "Needs Attention" || item.status === "Expired" ? "warning" : "unknown"} /></div><p>{item.account_hint ? `Configured account ending ${item.account_hint}.` : item.status === "Connected" ? "Connected through the shared OperiX platform." : "No connection is configured for this organization."}</p>{item.used_by.length ? <div className="integration-used"><span>Used by</span>{item.used_by.map((app) => <span className="used-app" key={app}>{app}</span>)}</div> : null}{item.last_error ? <p className="form-error">{item.last_error}</p> : null}<div className="integration-actions"><Link className="button button-quiet button-small" href={item.provider === "stripe" ? "/billing" : "/apps"}>Manage <ArrowRight size={14} /></Link></div></section>)}</div><div className="surface-panel secret-note"><KeyRound size={18} /><div><strong>Secrets stay server-side.</strong><p>Control only exposes masked account hints and connection health.</p></div></div></Frame>;
}

function BillingView({ data }: Omit<Props, "view"> & { data: OperationalData }) {
  const billing = data.billing;
  const connected = Boolean(billing?.plan_name || billing?.stripe_account_hint);
  return <Frame title="Billing & plans" description="Verified subscription snapshots and product-owned payment connection metadata."><section className="surface-panel billing-hero"><div className="billing-hero-icon"><CircleDollarSign size={22} /></div><div><span className="eyebrow-label">Current plan</span><h2>{billing?.plan_name || (billing?.stripe_account_hint ? "Product Stripe connected" : "Not connected")}</h2><p>{billing?.plan_name ? "Subscription state from the shared billing snapshot." : billing?.stripe_account_hint ? "A product-owned Stripe account exists; no shared SaaS subscription snapshot is configured." : "No organization subscription snapshot is available."}</p></div><StatusBadge label={connected ? billing?.status || "Connected" : "Unknown"} tone={connected ? "success" : "unknown"} /></section><div className="operational-two-column"><section className="surface-panel"><Panel title="Subscription" body="Control never fabricates plan, seat, or invoice values." /><Detail label="Provider" value={billing?.provider || "—"} /><Detail label="Billing cycle" value={billing?.billing_cycle || "—"} /><Detail label="Seats" value={billing?.seat_limit == null ? "—" : String(billing.seat_limit)} /><Detail label="Next invoice" value={billing?.next_invoice_at ? new Date(billing.next_invoice_at).toLocaleDateString() : "—"} />{billing?.portal_url ? <a className="button button-primary" href={billing.portal_url} target="_blank" rel="noreferrer">Open billing portal <ExternalLink size={14} /></a> : null}</section><section className="surface-panel"><Panel title="Payment connection" body="Existing product payment integrations remain owned by their applications." /><Detail label="Stripe account" value={billing?.stripe_account_hint ? `••••${billing.stripe_account_hint}` : "Not connected"} /><Detail label="Last connected" value={billing?.stripe_connected_at ? new Date(billing.stripe_connected_at).toLocaleString() : "—"} /><Link className="button button-quiet" href="/integrations">View integrations <ArrowRight size={15} /></Link></section></div></Frame>;
}

function UsageView({ data }: Omit<Props, "view"> & { data: OperationalData }) {
  function exportUsage() { downloadCsv("operix-usage.csv", data.usage.map((item) => ({ metric: item.metric, value: item.value, source: item.source })) as Array<Record<string, unknown>>); }
  return <Frame title="Usage" description="Measured organization activity from shared product tables and storage metadata." action={<button className="button button-quiet" type="button" onClick={exportUsage}><Download size={16} />Export CSV</button>}><div className="stat-grid compact-stat-grid">{data.usage.slice(0, 4).map((item) => <Metric key={item.metric} label={humanize(item.metric)} value={item.measured ? String(item.value) : "—"} detail={item.source} icon={Activity} />)}<Metric label="Storage" value={data.storage ? formatBytes(data.storage.bytes) : "—"} detail={data.storage?.source || "Not measured"} icon={Database} /></div><section className="surface-panel table-panel"><Panel title="Measured metrics" body="Values are read from tenant-scoped product records; unavailable telemetry is omitted." />{data.usage.map((item) => <div className="usage-row" key={item.metric}><strong>{humanize(item.metric)}</strong><span>{item.measured ? item.value.toLocaleString() : "—"}</span><small>{item.source}</small></div>)}</section></Frame>;
}

function SecurityView({ data, companyId, workspace, reload }: Omit<Props, "view"> & { data: OperationalData; reload: () => Promise<void> }) {
  const [requireAdmins, setRequireAdmins] = useState(data.policy?.require_mfa_admins || false); const [requireAll, setRequireAll] = useState(data.policy?.require_mfa_all || false); const [domains, setDomains] = useState((data.policy?.allowed_email_domains || []).join(", ")); const [policyMessage, setPolicyMessage] = useState(""); const client = createClient(); const canManage = workspace.permissions.has("security.manage");
  useEffect(() => { setRequireAdmins(data.policy?.require_mfa_admins || false); setRequireAll(data.policy?.require_mfa_all || false); setDomains((data.policy?.allowed_email_domains || []).join(", ")); }, [data.policy]);
  async function savePolicy() { if (!client) return; try { await updateSecurityPolicy(client, companyId, { requireMfaAdmins: requireAdmins, requireMfaAll: requireAll, allowedDomains: domains.split(",").map((item) => item.trim()).filter(Boolean), invitationPolicy: domains.trim() ? "allowed_domains" : "any_email" }); setPolicyMessage("Security policy saved. MFA enforcement applies through shared Auth at the next permission check."); await reload(); } catch (saveError) { setPolicyMessage(saveError instanceof Error ? saveError.message : "The security policy could not be saved."); } }
  async function revoke(userId: string) { if (!client || !window.confirm("Revoke all active sessions for this user?")) return; await revokeMemberSessions(client, companyId, userId); await reload(); }
  const summary = data.security;
  return <Frame title="Security" description="Measurable authentication posture and enforceable organization policies.">{policyMessage ? <Notice kind={policyMessage.includes("could not") || policyMessage.includes("denied") ? "error" : "success"}>{policyMessage}</Notice> : null}<div className="stat-grid compact-stat-grid"><Metric label="Admins" value={summary ? String(summary.admin_count) : "—"} detail="Owner and admin memberships" icon={ShieldCheck} /><Metric label="MFA adoption" value={summary ? `${summary.mfa_adoption}%` : "—"} detail={`${summary?.mfa_enrolled_count || 0} enrolled`} icon={KeyRound} /><Metric label="Active sessions" value={summary ? String(summary.active_session_count) : "—"} detail="Shared Supabase sessions" icon={Activity} /><Metric label="API keys" value={summary ? String(summary.api_key_count) : "—"} detail="Active, unexpired keys" icon={Code2} /></div><div className="operational-two-column"><section className="surface-panel"><Panel title="Organization members" body="MFA and session metadata are read from shared Supabase Auth tables; secrets are never returned." />{data.memberSecurity.map((security) => <div className="security-row" key={security.membership_id}><span className={`status-dot ${security.mfa_enrolled ? "status-dot-green" : "status-dot-gray"}`} /><div><strong>{security.user_id}</strong><span>{security.mfa_enrolled ? "MFA enrolled" : "MFA not enrolled"} · {security.active_sessions} active sessions</span></div>{workspace.permissions.has("security.manage") ? <button className="button button-quiet button-small" type="button" disabled={!security.active_sessions} onClick={() => void revoke(security.user_id)}>Revoke sessions</button> : null}</div>)}{!data.memberSecurity.length ? <State icon={ShieldCheck} title="No member security records" body="Security metadata is unavailable for this organization." /> : null}</section><section className="surface-panel"><Panel title="Security policies" body="MFA requirements are enforced through the shared authentication permission gate." /><label className="check-row"><span><strong>Require MFA for administrators</strong><small>Owners and admins must use an AAL2 session.</small></span><input type="checkbox" checked={requireAdmins} disabled={!canManage} onChange={(event) => setRequireAdmins(event.target.checked)} /></label><label className="check-row"><span><strong>Require MFA for all users</strong><small>All Control access requires an AAL2 session.</small></span><input type="checkbox" checked={requireAll} disabled={!canManage} onChange={(event) => setRequireAll(event.target.checked)} /></label><Field label="Allowed invitation domains" value={domains} onChange={setDomains} placeholder="company.com, subsidiary.com" /><button className="button button-primary" type="button" disabled={!canManage} onClick={() => void savePolicy()}><Check size={15} />Save security policy</button><p className="form-hint">Session timeout and password policy are not claimed here because Supabase Auth does not expose organization-level enforcement for them in this deployment.</p></section></div><section className="surface-panel"><Panel title="Verified domains" body="Add a TXT record before marking a domain verified." />{data.domains.map((domain) => <div className="operational-list-row" key={domain.id}><span className="operational-icon"><Globe2 size={17} /></span><span><strong>{domain.domain}</strong><small>{domain.verified_at ? `Verified ${new Date(domain.verified_at).toLocaleDateString()}` : `TXT operix-control-verification=${domain.verification_token}`}</small></span><StatusBadge label={domain.verified_at ? "Verified" : "Pending"} tone={domain.verified_at ? "success" : "warning"} /></div>)}{!data.domains.length ? <State icon={Globe2} title="No domains configured" body="Allowed domains can be added from organization settings." /> : null}</section></Frame>;
}

function StatusView() {
  const [services, setServices] = useState<Array<{ key: string; name: string; status: string; detail: string }>>([]); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/control/status", { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Status could not be loaded."); setServices(body.services || []); }).catch((statusError) => setError(statusError instanceof Error ? statusError.message : "Status could not be loaded.")); }, []);
  return <Frame title="System status" description="Availability from live health endpoints where the service exposes one." action={<button className="button button-quiet" type="button" onClick={() => window.location.reload()}><RefreshCw size={15} />Refresh</button>}><section className="surface-panel status-panel"><Panel title="OperiX services" body="Unknown means the service does not expose a reachable health endpoint." />{error ? <Notice kind="error">{error}</Notice> : services.map((service) => <div className="status-service-row" key={service.key}><span className="status-service-icon">{service.status === "Operational" ? <CheckCircle2 size={17} /> : <CircleHelp size={17} />}</span><strong>{service.name}</strong><span className="status-service-state"><span className={`status-dot ${service.status === "Operational" ? "status-dot-green" : service.status === "Degraded" ? "status-dot-amber" : "status-dot-gray"}`} />{service.status} · {service.detail}</span></div>)}</section></Frame>;
}

function Frame({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) { return <div className="view-frame"><div className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{action ? <div className="page-header-actions">{action}</div> : null}</div>{children}</div>; }
function Panel({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) { return <div className="panel-header"><div><h2>{title}</h2>{body ? <p>{body}</p> : null}</div>{action}</div>; }
function State({ icon: Icon, title, body, action, spin }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode; spin?: boolean }) { return <div className="empty-state"><Icon className={spin ? "spin" : ""} size={24} /><strong>{title}</strong><span>{body}</span>{action ? <div className="empty-state-action">{action}</div> : null}</div>; }
function Notice({ children, kind }: { children: React.ReactNode; kind: "success" | "error" }) { return <div className={`callout callout-${kind}`} role={kind === "error" ? "alert" : "status"}>{kind === "success" ? <CheckCircle2 size={17} /> : <ShieldAlert size={17} />}<span>{children}</span></div>; }
function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) { return <label className="field"><span className="field-label">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="field"><span className="field-label">{label}</span><input type="number" min={0} value={value || ""} onChange={(event) => onChange(Number(event.target.value || 0))} placeholder="Not configured" /></label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div>; }
function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) { return <div className="stat-card stat-card-blue"><span className="stat-icon"><Icon size={18} /></span><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>; }
function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "neutral" | "unknown" }) { return <span className={`status-badge status-badge-${tone}`}><span className="status-dot" />{label}</span>; }
function formatBytes(value: number) { if (!value) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function humanize(value: string) { return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) { if (!rows.length) return; const columns = Object.keys(rows[0]); const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(","))].join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function titleFor(view: ControlView) { return ({ teams: "Teams & groups", notifications: "Notifications", api: "API & webhooks", data: "Data & storage", automations: "Automations", integrations: "Integrations", billing: "Billing & plans", usage: "Usage", security: "Security", status: "System status" } as Record<string, string>)[view] || "OperiX Control"; }
function descriptionFor(view: ControlView) { return ({ teams: "Shared access groups", notifications: "Administrative alerts", api: "Developer access", data: "Measured storage and exports", automations: "Organization feature flags", integrations: "Connected services", billing: "Verified subscription metadata", usage: "Measured product activity", security: "Authentication posture", status: "Service health" } as Record<string, string>)[view] || ""; }
