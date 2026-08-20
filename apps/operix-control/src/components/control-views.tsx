"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileClock,
  Globe2,
  Grid2X2,
  LayoutGrid,
  Link2,
  Loader2,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  addDomain,
  createCustomRole,
  createInvitation,
  deleteCustomRole,
  getBillingOverview,
  getSecuritySummary,
  getStorageSummary,
  getUsageSummary,
  listAppEntitlements,
  listAppRegistry,
  listAuditEvents,
  listCompanyInvitations,
  listCompanyMembers,
  listDomains,
  listMemberAppAccess,
  listMemberSecurity,
  listPermissions,
  listRolePermissions,
  listRoles,
  revokeInvitation,
  revokeMember,
  setAppEntitlement,
  setMemberAppAccess,
  setMemberStatus,
  setRolePermissions,
  updateCompanyBranding,
  updateCompanyPreferences,
  updateCompanyProfile,
  updateMemberRole,
} from "@/lib/control-data";
import { appIcon, appLogoClass, displayName, formatRelativeTime, navigation, roleLabel } from "@/lib/control-registry";
import { safeExternalAppUrl } from "@/lib/safe-navigation";
import { useControlWorkspace } from "@/components/control-shell";
import { createClient } from "@/lib/supabase/client";
import type {
  AppEntitlementRow,
  AppRegistryRow,
  AuditRow,
  ControlView as ViewName,
  InvitationRow,
  MemberAppAccessRow,
  MemberRow,
  PermissionRow,
  RoleRow,
  BillingOverview,
  SecuritySummary as SecuritySummaryData,
  StorageSummary,
  UsageRow,
} from "@/lib/control-types";
import { useLocale } from "@/lib/i18n";
import { OperationalView } from "@/components/control-operational-views";

type ViewData = {
  members: MemberRow[];
  membersReady: boolean;
  invitations: InvitationRow[];
  invitationsReady: boolean;
  registry: AppRegistryRow[];
  registryReady: boolean;
  entitlements: AppEntitlementRow[];
  entitlementsReady: boolean;
  appAccess: MemberAppAccessRow[];
  appAccessReady: boolean;
  roles: RoleRow[];
  permissions: PermissionRow[];
  rolePermissions: Array<{ role_id: string; permission_code: string }>;
  audit: AuditRow[];
  auditReady: boolean;
};

const emptyData: ViewData = {
  members: [], membersReady: false, invitations: [], invitationsReady: false, registry: [], registryReady: false, entitlements: [], entitlementsReady: false, appAccess: [], appAccessReady: false, roles: [], permissions: [], rolePermissions: [], audit: [], auditReady: false,
};

function useControlData(view: ViewName) {
  const { workspace } = useControlWorkspace();
  const [data, setData] = useState<ViewData>(emptyData);
  const [loading, setLoading] = useState(view !== "organization" && view !== "integrations" && view !== "billing" && view !== "usage" && view !== "automations" && view !== "notifications" && view !== "data" && view !== "status" && view !== "settings");
  const [error, setError] = useState("");
  const companyId = workspace?.companyId;
  const permissionSet = workspace?.permissions;

  useEffect(() => {
    let active = true;
    async function load() {
      if (!companyId) return;
      const client = createClient();
      if (!client) return;
      setLoading(true);
      setError("");
      const next: ViewData = { ...emptyData };
      const canReadUsers = permissionSet?.has("users.read") === true;
      const canReadApps = permissionSet?.has("apps.read") === true;
      const canReadAudit = permissionSet?.has("audit.read") === true;
      const canReadRoles = permissionSet?.has("roles.read") === true;
      try {
        if (canReadUsers && (view === "overview" || view === "users" || view === "apps" || view === "security")) {
          next.members = await listCompanyMembers(client, companyId);
          next.membersReady = true;
        }
        if (canReadUsers && (view === "overview" || view === "users")) {
          try { next.invitations = await listCompanyInvitations(client, companyId); next.invitationsReady = true; } catch { next.invitations = []; }
        }
        if (canReadApps && (view === "overview" || view === "apps" || view === "users")) {
          const registry = await listAppRegistry(client);
          next.registry = registry.rows;
          next.registryReady = registry.foundationReady;
          const entitlements = await listAppEntitlements(client, companyId);
          next.entitlements = entitlements.rows;
          next.entitlementsReady = !entitlements.error;
          const access = await listMemberAppAccess(client, companyId);
          next.appAccess = access.rows;
          next.appAccessReady = !access.error;
        }
        if (canReadRoles && view === "roles") {
          next.roles = await listRoles(client, companyId);
          next.permissions = await listPermissions(client);
          next.rolePermissions = await listRolePermissions(client, next.roles.map((role) => role.id));
        }
        if (canReadAudit && (view === "overview" || view === "audit" || view === "security")) {
          next.audit = await listAuditEvents(client, companyId, view === "audit" ? 200 : 8);
          next.auditReady = true;
        }
        if (active) setData(next);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "This Control view could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [companyId, permissionSet, view]);

  return { data, loading, error, companyId: companyId || "" };
}

export function ControlView({ view, detailId }: { view: ViewName; detailId?: string }) {
  const { workspace } = useControlWorkspace();
  const { data, loading, error, companyId } = useControlData(view);
  const { t } = useLocale();
  const nav = navigation.find((item) => item.view === view);
  const permission = nav?.permission;

  if (permission && workspace && !workspace.permissions.has(permission)) {
    return <ViewFrame title={nav?.label || "Access restricted"} description={nav?.description || ""}><PermissionDenied /></ViewFrame>;
  }
  if (loading) return <ViewFrame title={nav?.label || "OperiX Control"} description={nav?.description || ""}><LoadingState /></ViewFrame>;
  if (error) return <ViewFrame title={nav?.label || "OperiX Control"} description={nav?.description || ""}><ErrorState message={error} onRetry={() => window.location.reload()} /></ViewFrame>;

  const common = { data, companyId, workspace: workspace!, t };
  switch (view) {
    case "overview": return <OverviewView {...common} />;
    case "organization": return <OrganizationView {...common} />;
    case "users": return <UsersView {...common} detailId={detailId} />;
    case "roles": return <RolesView {...common} />;
    case "apps": return <AppsView {...common} />;
    case "integrations": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    case "security": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    case "audit": return <AuditView {...common} />;
    case "billing": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    case "usage": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    case "status": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    case "settings": return <SettingsView {...common} />;
    case "teams": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    case "automations": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    case "notifications": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    case "api": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    case "data": return <OperationalView view={view} companyId={companyId} workspace={workspace!} />;
    default: return <UnavailableView {...common} title={nav?.label || "OperiX Control"} description={nav?.description || ""} note={t("notConfigured")} icon={Settings2} />;
  }
}

function ViewFrame({ title, description, action, dashboard = false, children }: { title: string; description: string; action?: React.ReactNode; dashboard?: boolean; children: React.ReactNode }) {
  return <div className="view-frame">{dashboard ? <section className="standard-dashboard-hero"><div className="standard-dashboard-hero-copy"><p className="standard-dashboard-kicker">Workspace overview</p><h1>{title}</h1><p>{description}</p></div>{action ? <div className="standard-dashboard-hero-actions">{action}</div> : null}</section> : <div className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{action ? <div className="page-header-actions">{action}</div> : null}</div>}{children}</div>;
}

function OverviewView({ data, workspace, companyId, t }: CommonProps) {
  const [security, setSecurity] = useState<SecuritySummaryData | null>(null);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  useEffect(() => {
    let active = true;
    const client = createClient();
    if (!client || !companyId) return () => { active = false; };
    const reads = [
      workspace.permissions.has("security.read") ? getSecuritySummary(client, companyId) : Promise.resolve(null),
      workspace.permissions.has("data.read") ? getStorageSummary(client, companyId) : Promise.resolve(null),
      workspace.permissions.has("usage.read") ? getUsageSummary(client, companyId) : Promise.resolve([] as UsageRow[]),
      workspace.permissions.has("billing.read") ? getBillingOverview(client, companyId) : Promise.resolve(null),
    ];
    Promise.all(reads).then(([nextSecurity, nextStorage, nextUsage, nextBilling]) => {
      if (!active) return;
      setSecurity(nextSecurity as SecuritySummaryData | null);
      setStorage(nextStorage as StorageSummary | null);
      setUsage(nextUsage as UsageRow[]);
      setBilling(nextBilling as BillingOverview | null);
    }).catch(() => {
      // Individual cards stay explicitly unknown when the role cannot read a contract.
    });
    return () => { active = false; };
  }, [companyId, workspace.permissions]);
  const enabledApps = data.entitlements.filter((item) => item.enabled);
  const adminCount = data.members.filter((member) => ["owner", "admin", "company_administrator", "organization_admin", "super_administrator"].includes(member.role_code || "") || ["owner", "admin"].includes(member.legacy_role || "")).length;
  const accessByApp = new Map<string, number>();
  data.appAccess.filter((access) => access.enabled).forEach((access) => accessByApp.set(access.app_key, (accessByApp.get(access.app_key) || 0) + 1));
  const appRows = data.registry;
  const workspaceName = workspace.company?.company_name || workspace.company?.name || "there";
  return <ViewFrame title={`Welcome, ${workspaceName}`} description={t("dashboardDescription")} action={<QuickActions />} dashboard>
    <div className="stat-grid overview-stat-grid">
      <StatCard icon={Users} label={t("usersStat")} value={data.membersReady ? String(data.members.length) : "—"} href="/users" detail={data.membersReady ? "Active organization memberships" : "Users permission required"} tone="blue" />
      <StatCard icon={Grid2X2} label={t("activeAppsStat")} value={data.entitlementsReady ? String(enabledApps.length) : "—"} href="/apps" detail={data.entitlementsReady ? "Enabled for this organization" : "Entitlements not connected"} tone="purple" />
      <StatCard icon={ShieldCheck} label={t("adminsStat")} value={data.membersReady ? String(adminCount) : "—"} href="/users" detail={data.membersReady ? "Owner and admin memberships" : "Users permission required"} tone="green" />
      <StatCard icon={Database} label={t("storageStat")} value={storage?.measured ? formatBytes(storage.bytes) : "—"} detail={storage?.measured ? `${storage.object_count.toLocaleString()} stored objects` : "Storage metric unavailable"} tone="slate" />
      <StatCard icon={BarChart3} label={t("monthlyUsageStat")} value={usage.length ? usage.filter((item) => item.measured).length.toLocaleString() : "—"} detail={usage.length ? "Measured organization metrics" : "Usage metric unavailable"} tone="amber" />
      <StatCard icon={ShieldAlert} label={t("securityAlertsStat")} value={security ? String(security.unread_notification_count) : "—"} href="/security" detail={security ? "Unread administrative notifications" : "Security metric unavailable"} tone="red" />
    </div>
    <section className="surface-panel apps-overview-panel"><PanelHeader title={t("yourApps")} description={t("suiteModules")} href="/apps" actionLabel={t("manageApps")} />
      <div className="app-overview-list">{appRows.length ? appRows.map((app) => { const Icon = appIcon(app.app_key); const entitlement = data.entitlements.find((item) => item.app_key === app.app_key); const status = entitlement ? entitlement.enabled ? "Enabled" : "Disabled" : "Not configured"; return <div className="app-overview-row" key={app.app_key}><span className={`${appLogoClass(app.app_key)} app-row-icon`}><Icon size={19} /></span><div className="app-row-name"><strong>{app.display_name}</strong><span>{app.description || "OperiX application"}</span></div><StatusBadge label={status} tone={entitlement?.enabled ? "success" : entitlement ? "neutral" : "unknown"} /><span className="app-row-users">{data.appAccessReady ? `${accessByApp.get(app.app_key) || 0} with access` : "Access data not connected"}</span><ExternalAppLink href={app.route} className="button button-quiet button-small">Open <ExternalLink size={14} /></ExternalAppLink><Link className="icon-button" href="/apps" aria-label={`Manage ${app.display_name}`}><MoreHorizontal size={18} /></Link></div>; }) : <EmptyState icon={LayoutGrid} title="App data unavailable" description="Your organization role does not include application access visibility." />}</div>
    </section>
    <div className="dashboard-lower-grid">
      <ActivityPanel events={data.audit} ready={data.auditReady} />
      <InvitationsPanel invitations={data.invitations} ready={data.invitationsReady} />
      <SecuritySummary summary={security} />
      {workspace.permissions.has("billing.read") ? <SubscriptionSummary workspace={workspace} billing={billing} /> : <UnavailableSummary title="Subscription summary" description="Billing permission is required to view subscription metadata." />}
    </div>
  </ViewFrame>;
}

function OrganizationView({ workspace, companyId }: CommonProps) {
  const company = workspace.company;
  const canManageOrganization = workspace.permissions.has("organization.manage");
  const [section, setSection] = useState("General");
  const [form, setForm] = useState({ companyName: company?.company_name || company?.name || "", email: company?.email || "", phone: company?.phone || "", address: company?.address || "", website: company?.website || "", taxId: company?.tax_id || "", logoUrl: company?.logo_url || "", default_language: company?.default_language || "en", currency: company?.currency || "EUR", primary_color: company?.primary_color || "#004FFE" });
  const [domains, setDomains] = useState<import("@/lib/control-types").DomainRow[]>([]);
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const client = createClient();
    if (!client || !companyId || !workspace.permissions.has("organization.read")) return;
    listDomains(client, companyId).then(setDomains).catch(() => setDomains([]));
  }, [companyId, workspace.permissions]);

  async function save() {
    const client = createClient();
    if (!client || !companyId) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await updateCompanyProfile(client, { companyId, companyName: form.companyName, email: form.email, phone: form.phone, address: form.address, website: form.website, taxId: form.taxId });
      await updateCompanyPreferences(client, companyId, { default_language: form.default_language, currency: form.currency, primary_color: form.primary_color });
      await updateCompanyBranding(client, companyId, { logoUrl: form.logoUrl, primaryColor: form.primary_color });
      setMessage("Organization settings saved.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The organization could not be updated."); } finally { setSaving(false); }
  }

  async function createDomain(event: React.FormEvent) {
    event.preventDefault();
    const client = createClient();
    if (!client || !companyId) return;
    try { const created = await addDomain(client, companyId, domain); setDomains((current) => [created, ...current.filter((item) => item.id !== created.id)]); setDomain(""); setMessage("Domain added. Publish the displayed TXT record before verifying it."); } catch (domainError) { setError(domainError instanceof Error ? domainError.message : "The domain could not be added."); }
  }

  async function verifyDomain(item: import("@/lib/control-types").DomainRow) {
    try {
      const response = await fetch("/api/control/domains/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId, domainId: item.id, domain: item.domain, token: item.verification_token }) });
      const body = await response.json() as { error?: string; domain?: import("@/lib/control-types").DomainRow };
      if (!response.ok) throw new Error(body.error || "Domain verification failed.");
      if (body.domain) setDomains((current) => current.map((currentDomain) => currentDomain.id === item.id ? body.domain! : currentDomain));
      setMessage("Domain verified.");
    } catch (verifyError) { setError(verifyError instanceof Error ? verifyError.message : "Domain verification failed."); }
  }

  const sections = ["General", "Business information", "Branding", "Localization", "Domains", "Authentication", "Notifications", "Data"];
  return <ViewFrame title="Organization" description="Manage the shared organization profile used across OperiX." action={canManageOrganization ? <button className="button button-primary" type="button" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />}{saving ? "Saving…" : "Save changes"}</button> : <span className="permission-note">Read-only organization access</span>}>
    {message ? <div className="callout callout-success" role="status"><CheckCircle2 size={17} /><span>{message}</span></div> : null}{error ? <div className="callout callout-error" role="alert"><ShieldAlert size={17} /><span>{error}</span></div> : null}
    <div className="settings-layout"><div className="settings-nav"><p className="settings-nav-label">Organization settings</p>{sections.map((item) => <button className={section === item ? "selected" : ""} key={item} type="button" onClick={() => setSection(item)}><span>{item}</span>{item === "Domains" ? <span className="settings-availability">{domains.length}</span> : item === "Authentication" ? <span className="settings-availability">Security</span> : null}</button>)}</div><div className="settings-content">
      {section === "General" || section === "Business information" ? <section className="surface-panel form-panel"><PanelHeader title={section} description="Keep the organization identity consistent across shared OperiX workflows." /><div className="form-grid"><Field label="Organization name" value={form.companyName} onChange={(value) => setForm({ ...form, companyName: value })} readOnly={!canManageOrganization} /><Field label="Legal name" value="Not available in shared company model" readOnly /><Field label="Organization ID" value={companyId} readOnly /><Field label="Website" value={form.website} onChange={(value) => setForm({ ...form, website: value })} placeholder="https://company.com" readOnly={!canManageOrganization} /><Field label="Business email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} readOnly={!canManageOrganization} /><Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} readOnly={!canManageOrganization} /><Field className="field-full" label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} readOnly={!canManageOrganization} /><Field label="Tax ID" value={form.taxId} onChange={(value) => setForm({ ...form, taxId: value })} readOnly={!canManageOrganization} /></div></section> : null}
      {section === "Branding" ? <section className="surface-panel form-panel"><PanelHeader title="Branding" description="The internal Control shell remains OperiX-branded; these values are shared with supported customer-facing surfaces." /><div className="form-grid"><Field label="Organization display name" value={form.companyName} onChange={(value) => setForm({ ...form, companyName: value })} readOnly={!canManageOrganization} /><Field label="Logo URL" value={form.logoUrl} onChange={(value) => setForm({ ...form, logoUrl: value })} placeholder="https://cdn.company.com/logo.svg" readOnly={!canManageOrganization} /><Field label="Primary brand color" value={form.primary_color} onChange={(value) => setForm({ ...form, primary_color: value })} readOnly={!canManageOrganization} /></div><p className="form-hint">Use a hosted HTTPS image URL. Secret or local filesystem paths are rejected.</p></section> : null}
      {section === "Localization" ? <section className="surface-panel form-panel"><PanelHeader title="Localization" description="These defaults are shared by Control and passed to products that support them." /><div className="form-grid"><SelectField label="Language" value={form.default_language} onChange={(value) => setForm({ ...form, default_language: value })} disabled={!canManageOrganization} options={[{ value: "en", label: "English" }, { value: "sq", label: "Shqip" }]} /><SelectField label="Currency" value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} disabled={!canManageOrganization} options={[{ value: "EUR", label: "EUR — Euro" }, { value: "USD", label: "USD — US Dollar" }]} /><Field label="Primary brand color" value={form.primary_color} onChange={(value) => setForm({ ...form, primary_color: value })} readOnly={!canManageOrganization} /></div></section> : null}
      {section === "Domains" ? <section className="surface-panel form-panel"><PanelHeader title="Allowed domains" description="Verified domains can be used to restrict invitations and prepare organization discovery." />{canManageOrganization ? <form className="inline-form" onSubmit={createDomain}><Field label="Domain" value={domain} onChange={setDomain} placeholder="company.com" required /><button className="button button-primary" type="submit"><Plus size={15} />Add domain</button></form> : null}<div className="domain-list">{domains.map((item) => <div className="operational-list-row" key={item.id}><span className="operational-icon"><Globe2 size={17} /></span><span><strong>{item.domain}</strong><small>{item.verified_at ? `Verified ${new Date(item.verified_at).toLocaleDateString()}` : `TXT operix-control-verification=${item.verification_token}`}</small></span><StatusBadge label={item.verified_at ? "Verified" : "Pending"} tone={item.verified_at ? "success" : "warning"} />{!item.verified_at && canManageOrganization ? <button className="button button-quiet button-small" type="button" onClick={() => void verifyDomain(item)}>Verify DNS</button> : null}</div>)}{!domains.length ? <EmptyState icon={Globe2} title="No domains configured" description="Add a domain to create a verified invitation boundary." /> : null}</div></section> : null}
      {section === "Authentication" ? <section className="surface-panel form-panel"><PanelHeader title="Authentication" description="Security policies and MFA enforcement live in the shared authentication control." /><p className="form-hint">Manage MFA requirements, invitation domains, active sessions, and verified domain status from the Security page.</p><Link className="button button-primary" href="/security">Open security settings <ArrowRight size={15} /></Link></section> : null}
      {section === "Notifications" ? <section className="surface-panel form-panel"><PanelHeader title="Notifications" description="Administrative notification preferences are centralized for the organization." /><p className="form-hint">Review and acknowledge security, billing, integration, and administration events in the notification center.</p><Link className="button button-primary" href="/notifications">Open notification center <ArrowRight size={15} /></Link></section> : null}
      {section === "Data" ? <section className="surface-panel form-panel"><PanelHeader title="Data" description="Storage, retention and organization exports are measured without exposing raw database administration." /><Link className="button button-primary" href="/data">Open data & storage <ArrowRight size={15} /></Link></section> : null}
      <section className="surface-panel info-panel"><div className="info-panel-icon"><ShieldCheck size={18} /></div><div><strong>Control stays the source of truth for organization governance.</strong><p>Invoice numbering, fiscalization, payroll, booking rules, and desk configuration remain owned by their respective applications.</p></div></section>
    </div></div>
  </ViewFrame>;
}

function UsersView({ data, companyId, workspace, detailId }: CommonProps & { detailId?: string }) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columns, setColumns] = useState({ apps: true, lastActivity: true, mfa: true });
  const [memberSecurity, setMemberSecurity] = useState<import("@/lib/control-types").MemberSecurityRow[]>([]);
  const [selected, setSelected] = useState<MemberRow | null>(detailId ? data.members.find((member) => member.user_id === detailId) || null : null);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canManageUsers = workspace.permissions.has("users.manage");
  const canManageRoles = workspace.permissions.has("roles.manage");
  useEffect(() => {
    if (detailId) setSelected(data.members.find((member) => member.user_id === detailId) || null);
  }, [data.members, detailId]);
  useEffect(() => {
    if (detailId || !workspace.permissions.has("security.read") || !companyId) return;
    const client = createClient();
    if (client) listMemberSecurity(client, companyId).then(setMemberSecurity).catch(() => setMemberSecurity([]));
  }, [companyId, detailId, workspace.permissions]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("invite") === "1") setInviteOpen(true);
  }, []);
  const securityByUser = useMemo(() => new Map(memberSecurity.map((item) => [item.user_id, item])), [memberSecurity]);
  const filteredMembers = data.members.filter((member) => {
    const name = displayName(member.first_name, member.last_name, member.email);
    return `${name} ${member.email || ""} ${member.role_name || ""}`.toLowerCase().includes(query.toLowerCase()) && (roleFilter === "all" || member.role_code === roleFilter);
  });
  const roles = Array.from(new Map(data.members.map((member) => [member.role_code || "read_only", member.role_name || roleLabel(member.role_code)]).map(([code, name]) => [code, name])).entries()).filter(([code]) => !["owner", "super_administrator"].includes(code));

  async function changeRole(member: MemberRow, roleCode: string) {
    const client = createClient(); if (!client) return;
    setBusyId(member.membership_id); setError("");
    try { await updateMemberRole(client, companyId, member.membership_id, roleCode); setMessage("Role updated. Refreshing the member list…"); window.location.reload(); } catch (changeError) { setError(changeError instanceof Error ? changeError.message : "The role could not be updated."); setBusyId(""); }
  }
  async function remove(member: MemberRow) {
    if (!window.confirm(`Remove ${displayName(member.first_name, member.last_name, member.email)} from this organization? Historical business data will be preserved.`)) return;
    const client = createClient(); if (!client) return;
    setBusyId(member.membership_id); setError("");
    try { await revokeMember(client, companyId, member.membership_id); setMessage("Organization access revoked. Historical data was preserved."); window.location.reload(); } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "The member could not be removed."); setBusyId(""); }
  }
  async function changeStatus(member: MemberRow, status: "active" | "suspended") {
    const name = displayName(member.first_name, member.last_name, member.email);
    const action = status === "suspended" ? "Suspend" : "Reactivate";
    if (!window.confirm(`${action} ${name}'s OperiX organization access? Historical business data will be preserved.`)) return;
    const client = createClient(); if (!client) return;
    setBusyId(member.membership_id); setError("");
    try { await setMemberStatus(client, companyId, member.membership_id, status); setMessage(`Organization access ${status === "suspended" ? "suspended" : "reactivated"}.`); window.location.reload(); } catch (statusError) { setError(statusError instanceof Error ? statusError.message : "The member status could not be updated."); setBusyId(""); }
  }

  if (detailId) {
    if (!selected) return <ViewFrame title="User detail" description="Review this organization member's shared OperiX access."><EmptyState icon={Users} title="User not found" description="This member may have been removed from the active organization." action={<Link className="button button-quiet" href="/users">Back to users</Link>} /></ViewFrame>;
    const appAccess = data.appAccess.filter((row) => row.membership_id === selected.membership_id);
    const selectedSecurity = securityByUser.get(selected.user_id);
    const isOwner = selected.role_code === "super_administrator" || selected.role_code === "owner" || selected.legacy_role === "owner";
    return <ViewFrame title="User detail" description="Review this member's shared OperiX access without deleting their global identity." action={<><Link className="button button-quiet" href="/users"><ArrowLeft size={16} />Back to users</Link>{canManageUsers && selected.status !== "active" ? <button className="button button-primary" type="button" disabled={busyId === selected.membership_id} onClick={() => void changeStatus(selected, "active")}><CheckCircle2 size={16} />Reactivate</button> : canManageUsers && !isOwner ? <button className="button button-danger-quiet" type="button" disabled={busyId === selected.membership_id} onClick={() => void changeStatus(selected, "suspended")}><ShieldAlert size={16} />Suspend access</button> : null}</>}>
      <section className="surface-panel user-detail-page"><div className="member-detail-head"><span className="avatar avatar-large avatar-blue">{displayName(selected.first_name, selected.last_name, selected.email).slice(0, 1).toUpperCase()}</span><div><span className="eyebrow-label">Organization member</span><h2>{displayName(selected.first_name, selected.last_name, selected.email)}</h2><p>{selected.email || "Email unavailable"}</p><StatusBadge label={selected.status === "active" ? "Active" : roleLabel(selected.status)} tone={selected.status === "active" ? "success" : "warning"} /></div></div><div className="detail-sections"><DetailItem label="Organization role" value={roleLabel(selected.role_code)} /><DetailItem label="Membership status" value={selected.status === "active" ? "Active" : roleLabel(selected.status)} /><DetailItem label="MFA" value={selectedSecurity ? selectedSecurity.mfa_enrolled ? "Enrolled" : "Not enrolled" : "Unknown"} /><DetailItem label="Sessions" value={selectedSecurity ? `${selectedSecurity.active_sessions} active` : "Unknown"} /><DetailItem label="Last activity" value={selectedSecurity?.last_session_at ? new Date(selectedSecurity.last_session_at).toLocaleString() : "Unknown"} /></div><div className="user-detail-section"><PanelHeader title="Applications" description="Application assignments are managed centrally; each product enforces its own domain permissions." />{data.registry.length ? <div className="user-app-access-list">{data.registry.map((app) => { const access = appAccess.find((row) => row.app_key === app.app_key); return <div className="user-app-access-row" key={app.app_key}><span><strong>{app.display_name}</strong><small>{access?.enabled ? "Access enabled" : "No access"}</small></span><StatusBadge label={access?.enabled ? "Enabled" : "No access"} tone={access?.enabled ? "success" : "neutral"} /></div>; })}</div> : <EmptyState icon={LayoutGrid} title="Application registry unavailable" description="The shared app registry is not available in this environment." />}</div><div className="user-detail-section"><PanelHeader title="Teams, activity, and audit" description="Audit history remains tenant-scoped and append-oriented." /><div className="detail-sections"><DetailItem label="Teams" value="Manage from Teams & groups" /><DetailItem label="Last activity" value={selectedSecurity?.last_session_at ? new Date(selectedSecurity.last_session_at).toLocaleString() : "Unknown"} /><DetailItem label="Audit" value="Open Audit Log for tenant-scoped administrative events" /></div><Link className="button button-quiet" href="/audit">Open audit log <ArrowRight size={15} /></Link></div></section>
    </ViewFrame>;
  }

  return <ViewFrame title="Users" description="Manage organization memberships, access, and invitations." action={canManageUsers ? <button className="button button-primary" type="button" onClick={() => setInviteOpen(true)}><UserPlus size={16} />Invite user</button> : <span className="permission-note">Read-only user access</span>}>
    {message ? <div className="callout callout-success" role="status"><CheckCircle2 size={17} /><span>{message}</span></div> : null}{error ? <div className="callout callout-error" role="alert"><ShieldAlert size={17} /><span>{error}</span></div> : null}
    <div className="stat-grid compact-stat-grid"><StatCard icon={Users} label="Members" value={data.membersReady ? String(data.members.length) : "—"} detail={data.membersReady ? "Active memberships" : "Membership data unavailable"} tone="blue" /><StatCard icon={Clock3} label="Pending invites" value={data.invitationsReady ? String(data.invitations.length) : "—"} detail={data.invitationsReady ? "Valid invitation records" : "Invitation data unavailable"} tone="amber" /><StatCard icon={ShieldCheck} label="Admins" value={data.membersReady ? String(data.members.filter((member) => ["super_administrator", "owner", "company_administrator"].includes(member.role_code || "")).length) : "—"} detail={data.membersReady ? "Super admins and admins" : "Membership data unavailable"} tone="green" /></div>
    <section className="surface-panel table-panel"><div className="table-toolbar"><div className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" /></div><select className="select-control" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option>{roles.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select><button className="button button-quiet button-small" type="button" onClick={() => setColumnsOpen((open) => !open)}><SlidersHorizontal size={15} />Columns</button>{columnsOpen ? <div className="columns-popover" role="dialog" aria-label="User table columns">{([ ["apps", "Applications"], ["lastActivity", "Last activity"], ["mfa", "MFA"] ] as const).map(([key, label]) => <label className="checkbox-row" key={key}><input type="checkbox" checked={columns[key]} onChange={(event) => setColumns({ ...columns, [key]: event.target.checked })} /><span>{label}</span></label>)}</div> : null}</div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Status</th><th>Organization role</th>{columns.apps ? <th>Apps</th> : null}{columns.lastActivity ? <th>Last activity</th> : null}{columns.mfa ? <th>MFA</th> : null}<th aria-label="Actions" /></tr></thead><tbody>{filteredMembers.map((member) => { const accessCount = data.appAccess.filter((row) => row.membership_id === member.membership_id && row.enabled).length; const security = securityByUser.get(member.user_id); return <tr key={member.membership_id}><td><Link className="person-cell" href={`/users/${member.user_id}`}><span className="avatar avatar-small avatar-blue">{displayName(member.first_name, member.last_name, member.email).slice(0, 1).toUpperCase()}</span><span><strong>{displayName(member.first_name, member.last_name, member.email)}</strong><small>{member.email || "Email unavailable"}</small></span></Link></td><td><StatusBadge label={member.status === "active" ? "Active" : roleLabel(member.status)} tone={member.status === "active" ? "success" : "warning"} /></td><td><select className="inline-select" value={member.role_code || "read_only"} disabled={!canManageRoles || busyId === member.membership_id} onChange={(event) => void changeRole(member, event.target.value)} aria-label={`Change role for ${member.email || "member"}`}>{roles.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></td>{columns.apps ? <td><span className="muted-inline">{data.appAccessReady ? `${accessCount} enabled` : "Unknown"}</span></td> : null}{columns.lastActivity ? <td><span className="muted-inline">{security?.last_session_at ? formatRelativeTime(security.last_session_at) : "Unknown"}</span></td> : null}{columns.mfa ? <td><span className="mfa-state"><span className={`status-dot ${security?.mfa_enrolled ? "status-dot-green" : "status-dot-gray"}`} />{security ? security.mfa_enrolled ? "Enrolled" : "Not enrolled" : "Unknown"}</span></td> : null}<td>{canManageUsers && member.role_code !== "owner" && member.legacy_role !== "owner" ? <button className="icon-button table-action" type="button" aria-label={`Remove ${member.email || "member"}`} disabled={busyId === member.membership_id} onClick={() => void remove(member)}><Trash2 size={16} /></button> : <span className="muted-inline">Owner</span>}</td></tr>; })}</tbody></table>{!filteredMembers.length ? <EmptyState icon={Users} title="No members found" description={query ? "Try a different search." : "Organization members will appear here."} /> : null}</div><div className="mobile-member-list">{filteredMembers.map((member) => <button className="mobile-member-row" type="button" key={member.membership_id} onClick={() => setSelected(member)}><span className="avatar avatar-small avatar-blue">{displayName(member.first_name, member.last_name, member.email).slice(0, 1).toUpperCase()}</span><span><strong>{displayName(member.first_name, member.last_name, member.email)}</strong><small>{member.email || "Email unavailable"}</small></span><span className="mobile-member-meta"><StatusBadge label={roleLabel(member.role_code)} tone="neutral" /><ChevronDown size={15} /></span></button>)}</div></section>
    <section className="surface-panel"><PanelHeader title="Pending invitations" description="Invitation metadata is tenant-scoped and expires after seven days." />{data.invitationsReady ? data.invitations.length ? <div className="invitation-list">{data.invitations.map((invitation) => <div className="invitation-row" key={invitation.id}><span className="invitation-icon"><Mail size={17} /></span><div><strong>{invitation.email}</strong><span>{roleLabel(invitation.role_code)} · Expires {new Date(invitation.expires_at).toLocaleDateString()}</span></div>{canManageUsers ? <button className="button button-quiet button-small" type="button" onClick={async () => { const client = createClient(); if (!client) return; try { await revokeInvitation(client, companyId, invitation.id); window.location.reload(); } catch (revokeError) { setError(revokeError instanceof Error ? revokeError.message : "Invitation could not be cancelled."); } }}>Cancel</button> : null}</div>)}</div> : <EmptyState icon={Mail} title="No pending invitations" description="Create an invitation when someone needs access to this organization." /> : <EmptyState icon={Mail} title="Invitation data unavailable" description="The shared invitation contract could not be read for this organization." />}</section>
    {inviteOpen ? <InviteDialog companyId={companyId} onClose={() => setInviteOpen(false)} onCreated={() => { setInviteOpen(false); window.location.reload(); }} /> : null}
    {selected ? <MemberDetailDialog member={selected} security={securityByUser.get(selected.user_id)} onClose={() => setSelected(null)} /> : null}
  </ViewFrame>;
}

function InviteDialog({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState("employee");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; email: string; role_code: string; expires_at: string } | null>(null);
  async function submit(event: React.FormEvent) { event.preventDefault(); const client = createClient(); if (!client) return; setBusy(true); setError(""); try { const invitation = await createInvitation(client, companyId, email, roleCode); setCreated(invitation); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "The invitation could not be created."); } finally { setBusy(false); } }
  return <Dialog title="Invite a user" onClose={onClose}>{created ? <div className="dialog-success"><CheckCircle2 size={28} /><h3>Invitation created</h3><p>The invitation record is ready for the existing OperiX invitation delivery flow. Control does not display bearer tokens in the browser.</p><div className="detail-sections"><DetailItem label="Email" value={created.email} /><DetailItem label="Organization role" value={roleLabel(created.role_code)} /><DetailItem label="Invitation ID" value={created.id} /><DetailItem label="Expires" value={new Date(created.expires_at).toLocaleDateString()} /></div><button className="button button-primary" type="button" onClick={onCreated}>Done</button></div> : <form className="dialog-form" onSubmit={submit}><Field label="Email" value={email} onChange={setEmail} placeholder="person@company.com" required /><SelectField label="Organization role" value={roleCode} onChange={setRoleCode} options={[{ value: "company_administrator", label: "Admin" }, { value: "manager", label: "Manager" }, { value: "employee", label: "Employee" }]} /><p className="form-hint">Super admin is reserved for the company owner and cannot be invited.</p>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <Mail size={16} />}{busy ? "Creating…" : "Create invitation"}</button></div></form>}</Dialog>;
}

function MemberDetailDialog({ member, security, onClose }: { member: MemberRow; security?: import("@/lib/control-types").MemberSecurityRow; onClose: () => void }) {
  return <Dialog title={displayName(member.first_name, member.last_name, member.email)} onClose={onClose}><div className="member-detail-head"><span className="avatar avatar-large avatar-blue">{displayName(member.first_name, member.last_name, member.email).slice(0, 1).toUpperCase()}</span><div><h3>{displayName(member.first_name, member.last_name, member.email)}</h3><p>{member.email}</p><StatusBadge label={roleLabel(member.role_code)} tone="neutral" /></div></div><div className="detail-sections"><DetailItem label="Status" value={member.status === "active" ? "Active" : roleLabel(member.status)} /><DetailItem label="Organization role" value={roleLabel(member.role_code)} /><DetailItem label="MFA" value={security ? security.mfa_enrolled ? "Enrolled" : "Not enrolled" : "Unknown"} /><DetailItem label="Sessions" value={security ? `${security.active_sessions} active` : "Unknown"} /><DetailItem label="Last activity" value={security?.last_session_at ? formatRelativeTime(security.last_session_at) : "Unknown"} /></div><p className="form-hint">Removing organization access does not delete the global OperiX identity or historical business data.</p><Link className="button button-primary" href={`/users/${member.user_id}`} onClick={onClose}>Open full detail</Link></Dialog>;
}

function RolesView({ data, companyId }: CommonProps) {
  // OperiX uses four fixed roles. Role permissions are managed in the
  // database migration and custom-role creation is intentionally unavailable.
  const canManageRoles = false;
  const [selectedRoleId, setSelectedRoleId] = useState(data.roles[0]?.id || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = data.roles.find((role) => role.id === selectedRoleId) || data.roles[0];
  const selectedPermissions = new Set(data.rolePermissions.filter((item) => item.role_id === selected?.id).map((item) => item.permission_code));
  useEffect(() => { setDraftPermissions(data.rolePermissions.filter((item) => item.role_id === selected?.id).map((item) => item.permission_code)); }, [selected?.id, data.rolePermissions]);
  const grouped = new Map<string, PermissionRow[]>();
  data.permissions.forEach((permission) => grouped.set(permission.category, [...(grouped.get(permission.category) || []), permission]));
  async function savePermissions() {
    const client = createClient();
    if (!client || !selected || selected.is_system) return;
    setSaving(true); setError("");
    try { await setRolePermissions(client, companyId, selected.id, draftPermissions); window.location.reload(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Role permissions could not be saved."); } finally { setSaving(false); }
  }
  async function removeRole() {
    const client = createClient();
    if (!client || !selected || selected.is_system || !window.confirm(`Delete the custom role ${selected.name}?`)) return;
    setSaving(true); setError("");
    try { await deleteCustomRole(client, companyId, selected.id); window.location.reload(); } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "The custom role could not be deleted."); setSaving(false); }
  }
  return <ViewFrame title="Roles & permissions" description="Review access governance without moving domain permissions out of their owning applications." action={canManageRoles ? <button className="button button-primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={16} />Create custom role</button> : <span className="permission-note">Read-only role access</span>}>
    {error ? <div className="callout callout-error" role="alert"><ShieldAlert size={17} /><span>{error}</span></div> : null}<div className="role-layout"><section className="surface-panel role-list-panel"><PanelHeader title="Organization roles" description="System roles are shared across the suite." />{data.roles.map((role) => <button type="button" className={`role-list-row ${role.id === selected?.id ? "selected" : ""}`} key={role.id} onClick={() => setSelectedRoleId(role.id)}><span className="role-list-icon"><LockKeyhole size={16} /></span><span><strong>{role.name}</strong><small>{role.description || "Organization access role"}</small></span>{role.is_system ? <StatusBadge label="System" tone="neutral" /> : <StatusBadge label="Custom" tone="blue" />}</button>)}</section><section className="surface-panel permissions-panel">{selected ? <><div className="panel-header"><div><h2>{selected.name}</h2><p>{selected.description || "Permission assignments for this role."}</p></div><div className="panel-header-actions"><StatusBadge label={selected.is_system ? "System role" : "Custom role"} tone={selected.is_system ? "neutral" : "blue"} />{canManageRoles && !selected.is_system ? <button className="button button-danger-quiet button-small" type="button" onClick={() => void removeRole()} disabled={saving}><Trash2 size={14} />Delete</button> : null}</div></div><div className="permission-matrix"><div className="permission-matrix-head"><span>Permission</span><span>Access</span></div>{Array.from(grouped.entries()).map(([category, permissions]) => <div className="permission-group" key={category}><p>{category}</p>{permissions.map((permission) => { const granted = draftPermissions.includes(permission.code); return <label className="permission-row" key={permission.code}><div><strong>{permission.name}</strong><small>{permission.description || permission.code}</small></div>{selected.is_system ? <span className={`permission-state ${selectedPermissions.has(permission.code) ? "granted" : "not-granted"}`}>{selectedPermissions.has(permission.code) ? <><Check size={14} />Granted</> : "Not granted"}</span> : <input type="checkbox" checked={granted} disabled={!canManageRoles || saving} onChange={(event) => setDraftPermissions((current) => event.target.checked ? [...new Set([...current, permission.code])] : current.filter((code) => code !== permission.code))} />}</label>; })}</div>)}</div>{canManageRoles && !selected.is_system ? <button className="button button-primary" type="button" onClick={() => void savePermissions()} disabled={saving}>{saving ? <Loader2 className="spin" size={15} /> : <Check size={15} />}Save permissions</button> : null}</> : <EmptyState icon={LockKeyhole} title="No roles available" description="Role definitions will appear after the RBAC foundation is connected." />}</section></div>
    <section className="surface-panel"><PanelHeader title="Permission matrix" description="Responsive by design: each role is evaluated as a readable permission list on smaller screens." /><div className="matrix-summary">{data.roles.slice(0, 5).map((role) => <div className="matrix-summary-row" key={role.id}><strong>{role.name}</strong><span>{data.rolePermissions.filter((item) => item.role_id === role.id).length} permissions</span><span>{role.is_system ? "System" : "Custom"}</span></div>)}</div></section>
    {createOpen ? <CreateRoleDialog companyId={companyId} permissions={data.permissions} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); window.location.reload(); }} /> : null}
  </ViewFrame>;
}

function CreateRoleDialog({ companyId, permissions, onClose, onCreated }: { companyId: string; permissions: PermissionRow[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [selected, setSelected] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); const client = createClient(); if (!client) return; setBusy(true); setError(""); try { await createCustomRole(client, companyId, name, description, selected); onCreated(); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "The role could not be created."); } finally { setBusy(false); } }
  return <Dialog title="Create custom role" onClose={onClose}><form className="dialog-form" onSubmit={submit}><Field label="Role name" value={name} onChange={setName} placeholder="Office Manager" required /><Field label="Description" value={description} onChange={setDescription} placeholder="Manage access for the office team" /><div className="permission-picker"><span className="field-label">Permissions</span>{permissions.map((permission) => <label key={permission.code} className="checkbox-row"><input type="checkbox" checked={selected.includes(permission.code)} onChange={(event) => setSelected(event.target.checked ? [...selected, permission.code] : selected.filter((code) => code !== permission.code))} /><span><strong>{permission.name}</strong><small>{permission.category} · {permission.description || permission.code}</small></span></label>)}</div>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create role"}</button></div></form></Dialog>;
}

function AppsView({ data, companyId, workspace }: CommonProps) {
  const canManageApps = workspace.permissions.has("apps.manage");
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const accessByApp = useMemo(() => { const map = new Map<string, MemberAppAccessRow[]>(); data.appAccess.forEach((row) => map.set(row.app_key, [...(map.get(row.app_key) || []), row])); return map; }, [data.appAccess]);
  async function toggle(appKey: string, enabled: boolean) { const client = createClient(); if (!client) return; if (!enabled && !window.confirm("Disable this app? Access will be removed, but data and configuration will be preserved.")) return; setBusy(appKey); setError(""); try { await setAppEntitlement(client, companyId, appKey, enabled); setMessage(enabled ? "App enabled. Data and configuration were preserved." : "App disabled. Access was disabled; data and configuration were preserved."); window.location.reload(); } catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : "App access could not be changed."); setBusy(""); } }
  async function toggleMember(membershipId: string, appKey: string, enabled: boolean) { const client = createClient(); if (!client) return; setBusy(`${membershipId}:${appKey}`); try { await setMemberAppAccess(client, companyId, membershipId, appKey, enabled); window.location.reload(); } catch (accessError) { setError(accessError instanceof Error ? accessError.message : "User app access could not be changed."); setBusy(""); } }
  return <ViewFrame title="Apps" description="Manage module availability and per-user access without moving business logic out of each application."><div className="callout callout-info"><ShieldCheck size={17} /><span>Disabling an app changes access only. OperiX preserves the app's data and configuration.</span></div>{message ? <div className="callout callout-success"><CheckCircle2 size={17} /><span>{message}</span></div> : null}{error ? <div className="callout callout-error"><ShieldAlert size={17} /><span>{error}</span></div> : null}<div className="app-admin-grid">{data.registry.length ? data.registry.map((app) => { const Icon = appIcon(app.app_key); const entitlement = data.entitlements.find((row) => row.app_key === app.app_key); const enabled = entitlement?.enabled === true; const access = accessByApp.get(app.app_key) || []; return <section className="surface-panel app-admin-card" key={app.app_key}><div className="app-admin-card-head"><span className={`${appLogoClass(app.app_key)} app-card-icon`}><Icon size={21} /></span><div><h2>{app.display_name}</h2><p>{app.description}</p></div><StatusBadge label={entitlement ? enabled ? "Enabled" : "Disabled" : "Not configured"} tone={enabled ? "success" : entitlement ? "warning" : "unknown"} /></div><div className="app-admin-meta"><span><strong>{data.appAccessReady ? access.filter((row) => row.enabled).length : "—"}</strong><small>users with access</small></span><span><strong>{entitlement?.plan || "—"}</strong><small>subscription</small></span><span><strong>—</strong><small>last activity</small></span></div><div className="app-admin-actions"><ExternalAppLink href={app.route} className="button button-quiet button-small">Open app <ExternalLink size={14} /></ExternalAppLink><button className={`button button-small ${enabled ? "button-danger-quiet" : "button-primary"}`} type="button" disabled={!canManageApps || busy === app.app_key || !data.entitlementsReady} onClick={() => void toggle(app.app_key, !enabled)}>{busy === app.app_key ? <Loader2 className="spin" size={15} /> : enabled ? <X size={15} /> : <Check size={15} />}{enabled ? "Disable" : "Enable"}</button><button className="button button-quiet button-small" type="button" disabled={!canManageApps} onClick={() => setSelectedApp(selectedApp === app.app_key ? null : app.app_key)}><Settings2 size={15} />Manage access</button></div>{selectedApp === app.app_key ? <div className="app-access-panel"><div className="app-access-header"><strong>Individual access</strong><span>{data.appAccessReady ? `${access.filter((row) => row.enabled).length} enabled` : "Access contract unavailable"}</span></div>{data.members.length ? data.members.map((member) => { const row = access.find((item) => item.membership_id === member.membership_id); const memberEnabled = row?.enabled === true; return <label className="app-access-row" key={member.membership_id}><span><strong>{displayName(member.first_name, member.last_name, member.email)}</strong><small>{member.email || roleLabel(member.role_code)}</small></span><input type="checkbox" checked={memberEnabled} disabled={!canManageApps || !data.appAccessReady || busy === `${member.membership_id}:${app.app_key}`} onChange={(event) => void toggleMember(member.membership_id, app.app_key, event.target.checked)} /></label>; }) : <EmptyState icon={Users} title="No users" description="Add organization members before assigning access." />}</div> : null}</section>; }) : <EmptyState icon={LayoutGrid} title="Application registry unavailable" description="Application visibility is not available for this organization role." />}</div></ViewFrame>;
}

function AuditView({ data }: CommonProps) {
  const [query, setQuery] = useState(""); const [action, setAction] = useState("all"); const [application, setApplication] = useState("all");
  const actions = Array.from(new Set(data.audit.map((event) => event.action))).sort();
  const applications = Array.from(new Set(data.audit.map((event) => event.application || "control"))).sort();
  const events = data.audit.filter((event) => `${event.action} ${event.entity_type} ${event.entity_key || ""}`.toLowerCase().includes(query.toLowerCase()) && (action === "all" || event.action === action) && (application === "all" || (event.application || "control") === application));
  function exportAudit() { downloadCsv("operix-audit.csv", events.map((event) => ({ action: event.action, target: event.entity_type, target_id: event.entity_key || event.entity_id || "", actor: event.actor_user_id || "system", application: event.application || "control", occurred_at: event.occurred_at, changes: event.has_changes ? "recorded" : "none" }))); }
  return <ViewFrame title="Audit log" description="Append-oriented administrative history for the active organization." action={<button className="button button-quiet" type="button" disabled={!events.length} onClick={exportAudit}><Download size={16} />Export CSV</button>}><section className="surface-panel table-panel"><div className="table-toolbar"><div className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actions or targets" /></div><select className="select-control" value={action} onChange={(event) => setAction(event.target.value)}><option value="all">All actions</option>{actions.map((item) => <option key={item} value={item}>{item}</option>)}</select><select className="select-control" value={application} onChange={(event) => setApplication(event.target.value)}><option value="all">All applications</option>{applications.map((item) => <option key={item} value={item}>{item}</option>)}</select><button className="button button-quiet button-small" type="button" onClick={() => window.location.reload()}><RefreshCw size={15} />Refresh</button></div><div className="data-table-wrap"><table className="data-table audit-table"><thead><tr><th>Action</th><th>Target</th><th>Actor</th><th>Application</th><th>Date</th><th>Changes</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td><span className="audit-action"><span className="audit-action-icon"><FileClock size={15} /></span><strong>{event.action}</strong></span></td><td><strong>{event.entity_type}</strong><small>{event.entity_key || event.entity_id || "—"}</small></td><td><span className="muted-inline">{event.actor_user_id || "System"}</span></td><td><span className="muted-inline">{event.application || "control"}</span></td><td><span className="muted-inline">{formatRelativeTime(event.occurred_at)}</span><small>{new Date(event.occurred_at).toLocaleString()}</small></td><td><span className="change-summary">{event.has_changes ? "Recorded" : "No payload"}</span></td></tr>)}</tbody></table>{!events.length ? <EmptyState icon={FileClock} title="No audit events match" description="Administrative events will appear here when the shared audit stream records them." /> : null}</div></section><div className="callout callout-info"><ShieldCheck size={17} /><span>Audit change details are redacted from the browser; only a change-present marker is exposed.</span></div></ViewFrame>;
}

function SettingsView({ workspace }: CommonProps) {
  return <ViewFrame title="Settings" description="Control preferences and links to configuration owned by individual products."><div className="settings-card-grid"><SettingsLink icon={Building2} title="Organization" description="General business information, branding, and localization." href="/organization" /><SettingsLink icon={LockKeyhole} title="Authentication" description="Shared Supabase Auth policies and access boundary." href="/security" /><SettingsLink icon={Link2} title="Integrations" description="Verified connection metadata and ownership." href="/integrations" /><SettingsLink icon={Code2} title="Developer" description="API and webhook registry when supported." href="/api" /><SettingsLink icon={Database} title="Data" description="Retention, storage, and export visibility." href="/data" /><SettingsLink icon={Grid2X2} title="Application settings" description="Open Invoice, HR, Booking, or Desk for product-owned settings." href="/apps" /></div><section className="surface-panel settings-brand-preview"><div className="brand-preview"><span className="brand-mark">O</span><div><strong>{workspace.company?.company_name || "OperiX organization"}</strong><span>Customer-facing brand preview</span></div></div><div className="brand-color-swatch" style={{ background: workspace.company?.primary_color || "#004FFE" }} /><p>OperiX Control keeps its internal shell visually consistent with OperiX. Organization branding is surfaced to products and documents where supported.</p></section></ViewFrame>;
}

function UnavailableView({ title, description, note, icon: Icon }: { title: string; description: string; note: string; icon: LucideIcon } & CommonProps) {
  return <ViewFrame title={title} description={description}><section className="surface-panel unavailable-panel"><span className="unavailable-icon"><Icon size={24} /></span><h2>Not connected</h2><p>{note}</p><div className="unavailable-actions"><Link className="button button-quiet" href="/settings">Review settings <ArrowRight size={15} /></Link><Link className="button button-quiet" href="/audit">View audit log <FileClock size={15} /></Link></div></section></ViewFrame>;
}

type CommonProps = { data: ViewData; companyId: string; workspace: NonNullable<ReturnType<typeof useControlWorkspace>["workspace"]>; t: (key: string) => string };

function QuickActions() { return <div className="quick-actions"><Link className="button button-primary button-small" href="/users?invite=1"><UserPlus size={15} />Invite user</Link><Link className="button button-quiet button-small" href="/apps"><Grid2X2 size={15} />Manage apps</Link><Link className="button button-quiet button-small" href="/security"><ShieldCheck size={15} />View security</Link></div>; }

function PanelHeader({ title, description, href, actionLabel }: { title: string; description?: string; href?: string; actionLabel?: string }) { return <div className="panel-header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{href ? <Link className="panel-link" href={href}>{actionLabel || "View all"}<ArrowRight size={14} /></Link> : null}</div>; }

function StatCard({ icon: Icon, label, value, detail, href, tone }: { icon: LucideIcon; label: string; value: string; detail: string; href?: string; tone: string }) { const content = <div className={`stat-card stat-card-${tone}`}><span className="stat-icon"><Icon size={18} /></span><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>{href ? <ArrowUpRight className="stat-arrow" size={16} /> : null}</div>; return href ? <Link href={href}>{content}</Link> : content; }

function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "neutral" | "blue" | "unknown" }) { return <span className={`status-badge status-badge-${tone}`}><span className="status-dot" />{label}</span>; }

function ActivityPanel({ events, ready }: { events: AuditRow[]; ready: boolean }) { return <section className="surface-panel dashboard-panel"><PanelHeader title="Recent administrative activity" href="/audit" actionLabel="View all" />{ready ? <ActivityList events={events} emptyTitle="No administrative activity" /> : <EmptyState icon={FileClock} title="Activity unavailable" description="Your organization role does not include audit visibility." />}</section>; }
function ActivityList({ events, emptyTitle }: { events: AuditRow[]; emptyTitle: string }) { return events.length ? <div className="activity-list">{events.slice(0, 6).map((event) => <div className="activity-row" key={event.id}><span className="activity-icon"><FileClock size={15} /></span><div><strong>{event.action} · {event.entity_type}</strong><span>{event.entity_key || event.entity_id || "Shared OperiX event"}</span></div><time>{formatRelativeTime(event.occurred_at)}</time></div>)}</div> : <EmptyState icon={FileClock} title={emptyTitle} description="Events will appear when privileged changes are recorded." />; }
function InvitationsPanel({ invitations, ready }: { invitations: InvitationRow[]; ready: boolean }) { return <section className="surface-panel dashboard-panel"><PanelHeader title="Pending invitations" href="/users" actionLabel="View users" />{ready ? invitations.length ? <div className="mini-list">{invitations.slice(0, 4).map((invitation) => <div className="mini-row" key={invitation.id}><span className="mini-icon"><Mail size={15} /></span><div><strong>{invitation.email}</strong><span>{roleLabel(invitation.role_code)}</span></div><time>{formatRelativeTime(invitation.created_at)}</time></div>)}</div> : <EmptyState icon={Mail} title="No pending invitations" description="Invitations will appear here until accepted or expired." /> : <EmptyState icon={Mail} title="Invitations unavailable" description="Your organization role does not include user visibility." />}</section>; }
function SecuritySummary({ summary }: { summary: SecuritySummaryData | null }) { return <section className="surface-panel dashboard-panel"><PanelHeader title="Security alerts" href="/security" actionLabel="View security" />{summary ? <div className="subscription-summary"><span className="eyebrow-label">Unread administrative notifications</span><strong>{summary.unread_notification_count}</strong><div><span>Admins</span><span>{summary.admin_count}</span></div><div><span>MFA adoption</span><span>{summary.mfa_adoption}%</span></div><div><span>Active sessions</span><span>{summary.active_session_count}</span></div></div> : <div className="summary-empty"><ShieldAlert size={20} /><strong>Security summary unavailable</strong><span>Your current role cannot read the organization security contract.</span></div>}</section>; }
function SubscriptionSummary({ workspace, billing }: { workspace: CommonProps["workspace"]; billing: BillingOverview | null }) { const connected = Boolean(billing?.plan_name || billing?.stripe_account_hint || (workspace.profile.stripe_account_id && workspace.profile.stripe_connected_at)); return <section className="surface-panel dashboard-panel"><PanelHeader title="Subscription summary" href="/billing" actionLabel="View billing" /><div className="subscription-summary"><span className="eyebrow-label">Billing connection</span><strong>{billing?.plan_name || (connected ? "Stripe connected" : "Not connected")}</strong><div><span>Plan</span><span>{billing?.plan_name || "—"}</span></div><div><span>Seats</span><span>{billing?.seat_limit == null ? "—" : billing.seat_limit}</span></div><div><span>Next invoice</span><span>{billing?.next_invoice_at ? new Date(billing.next_invoice_at).toLocaleDateString() : "—"}</span></div></div></section>; }
function UnavailableSummary({ title, description }: { title: string; description: string }) { return <section className="surface-panel dashboard-panel"><PanelHeader title={title} /><div className="summary-empty"><LockKeyhole size={20} /><strong>Unavailable</strong><span>{description}</span></div></section>; }
function SettingsLink({ icon: Icon, title, description, href }: { icon: LucideIcon; title: string; description: string; href: string }) { return <Link className="surface-panel settings-link" href={href}><span className="settings-link-icon"><Icon size={18} /></span><div><strong>{title}</strong><p>{description}</p></div><ArrowRight size={16} /></Link>; }
function ExternalAppLink({ href, className, children }: { href?: string | null; className: string; children: React.ReactNode }) { const safeHref = safeExternalAppUrl(href); return safeHref ? <a className={className} href={safeHref} target="_blank" rel="noreferrer">{children}</a> : <span className={`${className} link-disabled`} aria-disabled="true">Unavailable</span>; }
function Field({ label, value, onChange, placeholder, readOnly, className, required }: { label: string; value: string; onChange?: (value: string) => void; placeholder?: string; readOnly?: boolean; className?: string; required?: boolean }) { return <label className={`field ${className || ""}`}><span className="field-label">{label}</span><input value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} readOnly={readOnly} required={required} /></label>; }
function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) { return <label className="field"><span className="field-label">{label}</span><span className="select-wrap"><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={15} /></span></label>; }
function DetailItem({ label, value }: { label: string; value: string }) { return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div>; }
function LoadingState() { return <div className="surface-panel loading-state"><Loader2 className="spin" size={22} /><span>Loading organization data…</span></div>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="surface-panel error-state"><ShieldAlert size={24} /><h2>Could not load this view</h2><p>{message}</p><button className="button button-primary" type="button" onClick={onRetry}>Retry</button></div>; }
function PermissionDenied() { return <div className="surface-panel error-state"><LockKeyhole size={24} /><h2>Access restricted</h2><p>Your organization role does not include the permission required for this Control surface.</p><Link className="button button-quiet" href="/dashboard">Return to overview</Link></div>; }
function formatBytes(value: number) { if (!value) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) { if (!rows.length) return; const columns = Object.keys(rows[0]); const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(","))].join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) { return <div className="empty-state"><Icon size={22} /><strong>{title}</strong><span>{description}</span>{action ? <div className="empty-state-action">{action}</div> : null}</div>; }
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>{children}</div></div>; }
