"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Command,
  Search,
  X,
} from "lucide-react";
import { OperixAppShell, OperixMobileNavigation, OperixSidebar, OperixTopBar, type OperixSidebarLinkProps } from "@invoice-monorepo/app-shell";
import { createClient } from "@/lib/supabase/client";
import { appEnvironment } from "@/lib/supabase/config";
import { listNotifications, resolveControlWorkspace, searchControl, signOut } from "@/lib/control-data";
import { canView, launcherApps, navigation } from "@/lib/control-registry";
import { safeExternalAppUrl } from "@/lib/safe-navigation";
import type { SearchResult, Workspace } from "@/lib/control-types";
import { useLocale } from "@/lib/i18n";
import { ControlLogo } from "./product-logo";
import { useTheme } from "./theme-provider";

type ContextValue = {
  workspace: Workspace | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const ControlWorkspaceContext = createContext<ContextValue | null>(null);

export function useControlWorkspace() {
  const value = useContext(ControlWorkspaceContext);
  if (!value) throw new Error("useControlWorkspace must be used inside ControlShell");
  return value;
}

function initialWorkspace(): Workspace {
  return { user: null, profile: { id: "" }, company: null, companies: [], companyId: null, permissions: new Set(), accessChecked: false };
}

function initials(firstName?: string | null, lastName?: string | null, email?: string | null) {
  const value = `${firstName || ""}${lastName || ""}`.trim();
  if (value) return value.slice(0, 2).toUpperCase();
  return (email || "OP").slice(0, 2).toUpperCase();
}

function companyLabel(company: Workspace["company"] | undefined) {
  return company?.company_name || company?.name || "Organization";
}

export function ControlShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const refresh = useCallback(async () => {
    const client = createClient();
    if (!client) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextWorkspace = await resolveControlWorkspace(client);
      if (!nextWorkspace.user || !nextWorkspace.companyId || !nextWorkspace.permissions.has("control.access")) {
        throw new Error("Control access is restricted for this organization.");
      }
      setWorkspace(nextWorkspace);
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : "The organization workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let active = true;
    const client = createClient();
    if (!client || !workspace?.companyId || !workspace.permissions.has("security.read")) { setUnreadNotifications(0); return () => { active = false; }; }
    listNotifications(client, workspace.companyId).then((items) => { if (active) setUnreadNotifications(items.filter((item) => !item.read_at).length); }).catch(() => { if (active) setUnreadNotifications(0); });
    return () => { active = false; };
  }, [workspace?.companyId, workspace?.permissions]);

  useEffect(() => {
    const refreshNotifications = () => {
      if (!workspace?.companyId) return;
      const client = createClient();
      if (client) listNotifications(client, workspace.companyId).then((items) => setUnreadNotifications(items.filter((item) => !item.read_at).length)).catch(() => undefined);
    };
    window.addEventListener("control-notifications-updated", refreshNotifications);
    return () => window.removeEventListener("control-notifications-updated", refreshNotifications);
  }, [workspace?.companyId]);

  useEffect(() => {
    let active = true;
    const client = createClient();
    if (!commandOpen || !client || !workspace?.companyId || !commandQuery.trim()) { setSearchResults([]); return () => { active = false; }; }
    const timer = window.setTimeout(() => { searchControl(client, workspace.companyId!, commandQuery).then((items) => { if (active) setSearchResults(items); }).catch(() => { if (active) setSearchResults([]); }); }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [commandOpen, commandQuery, workspace?.companyId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        setOrganizationOpen(false);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setOrganizationOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleNavigation = useMemo(() => navigation.filter((item) => !workspace || canView(item, workspace.permissions)), [workspace]);
  const currentItem = visibleNavigation.find((item) => pathname === `/${item.view === "overview" ? "dashboard" : item.view}` || pathname.startsWith(`/${item.view}/`));
  const userName = workspace?.profile.first_name || workspace?.profile.email?.split("@")[0] || "there";
  const userInitials = initials(workspace?.profile.first_name, workspace?.profile.last_name, workspace?.profile.email);
  const renderSidebarLink = ({ href, className, children, onClick, "aria-current": ariaCurrent }: OperixSidebarLinkProps) => <Link href={href} className={className} onClick={onClick} aria-current={ariaCurrent}>{children}</Link>;
  const sharedNavigation = visibleNavigation.filter((item) => item.view !== "settings").map((item) => ({ href: item.view === "overview" ? "/dashboard" : `/${item.view}`, label: t(item.view), icon: item.icon, active: pathname === (item.view === "overview" ? "/dashboard" : `/${item.view}`) || (item.view !== "overview" && pathname.startsWith(`/${item.view}/`)) }));
  const settingsItem = visibleNavigation.find((item) => item.view === "settings");

  async function switchOrganization(companyId: string) {
    const client = createClient();
    if (!client || companyId === workspace?.companyId) {
      setOrganizationOpen(false);
      return;
    }
    const { error: switchError } = await client.rpc("set_active_company", { p_company_id: companyId });
    if (switchError) {
      setError(switchError.message);
      return;
    }
    setOrganizationOpen(false);
    setWorkspace(null);
    await refresh();
    router.refresh();
  }

  async function handleSignOut() {
    const client = createClient();
    if (client) await signOut(client);
    router.replace("/login");
    router.refresh();
  }

  function navigateTo(href: string) {
    setCommandOpen(false);
    setMobileOpen(false);
    router.push(href);
  }

  if (loading && !workspace) {
    return <div className="app-loading"><ControlLogo /><span>{t("loading")}</span></div>;
  }
  if (error && !workspace) {
    return <div className="app-loading"><div className="setup-card"><ControlLogo /><h1>OperiX Control</h1><p>{error}</p><button className="button button-primary" type="button" onClick={() => void refresh()}>{t("retry")}</button></div></div>;
  }

  const renderTopbarLink = ({ href, className, children, onClick, "aria-label": ariaLabel }: { href: string; className: string; children: React.ReactNode; onClick?: () => void; "aria-label"?: string }) => <Link href={href} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</Link>;
  const topbarApps = launcherApps.map((app) => { const Icon = app.icon; const href = app.internal ? "/dashboard" : safeExternalAppUrl(app.href); return { id: app.key, label: app.name, href: href || undefined, current: app.key === "control", available: Boolean(href), icon: <Icon size={14} strokeWidth={2.1} /> }; });
  const mobileItems = sharedNavigation.slice(0, 4).map((item) => ({ href: item.href, label: item.label, icon: <item.icon size={19} />, active: item.active }));

  return <ControlWorkspaceContext.Provider value={{ workspace: workspace || initialWorkspace(), loading, error, refresh }}>
    <OperixAppShell className="control-frame" mainClassName="control-main" sidebar={<OperixSidebar
        logo={<ControlLogo href="/dashboard" />}
        ariaLabel="OperiX Control navigation"
        navSections={[
          { label: "Workspace", items: sharedNavigation.slice(0, 9) },
          { label: "Manage", items: sharedNavigation.slice(9) },
        ]}
        settingsItem={settingsItem ? { href: "/settings", label: t("settings"), icon: settingsItem.icon, active: pathname === "/settings" || pathname.startsWith("/settings/") } : { href: "/settings", label: t("settings"), icon: navigation[navigation.length - 1].icon, active: pathname === "/settings" }}
        workspaceName={companyLabel(workspace?.company)}
        workspaces={(workspace?.companies || []).map((company) => ({ id: company.id, name: companyLabel(company) }))}
        activeWorkspaceId={workspace?.companyId}
        workspaceOpen={organizationOpen}
        onWorkspaceToggle={() => setOrganizationOpen(!organizationOpen)}
        onWorkspaceSelect={(id) => void switchOrganization(id)}
        user={{ initials: userInitials, name: userName, role: "Control admin" }}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={() => void handleSignOut()}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        renderLink={renderSidebarLink}
      /> } topbar={<OperixTopBar
        apps={topbarApps}
        breadcrumbs={<><span>OperiX Control</span><span>/</span><strong>{currentItem ? t(currentItem.view) : t("overview")}</strong></>}
        search={{ value: "", onClick: () => setCommandOpen(true), placeholder: t("search"), ariaLabel: t("search") }}
        help={{ href: "/settings", label: "Help" }}
        notifications={{ href: "/notifications", count: unreadNotifications, label: unreadNotifications ? `${t("notifications")}: ${unreadNotifications} unread` : t("notifications") }}
        user={{ initials: userInitials, href: "/settings", label: "Open settings" }}
        onMobileMenu={() => setMobileOpen(true)}
        renderLink={renderTopbarLink}
      /> }>
      {appEnvironment !== "production" ? <div className="environment-banner" role="status"><span>{appEnvironment.toUpperCase()} ENVIRONMENT</span><small>Changes here do not affect production.</small></div> : null}
      {error && workspace ? <div className="inline-error" role="status"><span>{error}</span><button type="button" onClick={() => setError("")}><X size={15} /></button></div> : null}
      <div className="control-content">{children}</div>
      <OperixMobileNavigation items={mobileItems} primaryAction={{ href: "/users?invite=1", label: "Invite user", icon: <Command size={21} /> }} moreAction={{ label: "More", icon: <Command size={19} />, onClick: () => setMobileOpen(true) }} renderLink={renderTopbarLink} />
    </OperixAppShell>
      {commandOpen ? <CommandPalette query={commandQuery} setQuery={setCommandQuery} onClose={() => { setCommandOpen(false); setCommandQuery(""); }} onNavigate={navigateTo} t={t} permissions={workspace?.permissions || new Set()} searchResults={searchResults} /> : null}
  </ControlWorkspaceContext.Provider>;
}

function CommandPalette({ query, setQuery, onClose, onNavigate, t, permissions, searchResults }: { query: string; setQuery: (value: string) => void; onClose: () => void; onNavigate: (href: string) => void; t: (key: string) => string; permissions: Set<import("@/lib/control-types").ControlPermission>; searchResults: SearchResult[] }) {
  const normalized = query.trim().toLowerCase();
  const navResults = navigation.filter((item) => canView(item, permissions) && `${item.label} ${item.description}`.toLowerCase().includes(normalized)).slice(0, 8);
  const actions = [
    { label: "Invite user", href: "/users?invite=1" },
    { label: "Manage apps", href: "/apps" },
    { label: "View security", href: "/security" },
    { label: "Open audit log", href: "/audit" },
  ].filter((action) => action.label.toLowerCase().includes(normalized));
  return <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="command-dialog" role="dialog" aria-modal="true" aria-labelledby="command-title"><div className="command-header"><Command size={18} /><div><strong id="command-title">{t("commandTitle")}</strong><span>{t("commandHint")}</span></div><button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={17} /></button></div><label className="command-input"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("commandSearchPlaceholder")} /></label><div className="command-results">{searchResults.length ? <><p className="command-group-label">Search results</p>{searchResults.map((result) => <button key={`${result.entity_type}-${result.entity_id || result.href}`} type="button" onClick={() => onNavigate(result.href)}><Search size={16} /><span>{result.title}</span><small>{result.subtitle || result.entity_type}</small><ChevronRight size={15} /></button>)}</> : null}<p className="command-group-label">{t("navigation")}</p>{navResults.map((item) => <button key={item.view} type="button" onClick={() => onNavigate(item.view === "overview" ? "/dashboard" : `/${item.view}`)}><item.icon size={16} /><span>{t(item.view)}</span><small>{item.description}</small><ChevronRight size={15} /></button>)}{actions.length ? <><p className="command-group-label">{t("quickActions")}</p>{actions.map((action) => <button key={action.href} type="button" onClick={() => onNavigate(action.href)}><Command size={16} /><span>{action.label}</span><ChevronRight size={15} /></button>)}</> : null}{!searchResults.length && !navResults.length && !actions.length ? <div className="command-empty">{t("noMatchingActions")}</div> : null}</div></div></div>;
}
