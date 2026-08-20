"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Armchair, Award, BriefcaseBusiness, Building2, CalendarDays, ClipboardCheck, FileSignature, FileText, Grid2X2, LayoutDashboard, Plus, ReceiptText, Settings, ShieldCheck, Users, UsersRound, Workflow } from "lucide-react";
import { OperixAppShell, OperixMobileNavigation, OperixSidebar, OperixTopBar, type OperixSidebarItem, type OperixSidebarLinkProps } from "@invoice-monorepo/app-shell";
import { createClient } from "@/lib/supabase/client";
import { useHrWorkspace } from "@/lib/workspace";
import { useHrLocale } from "@/lib/i18n";
import { useTheme } from "./theme-provider";
import { HrLogo } from "./product-logo";

type NavItem = OperixSidebarItem;
const primary: NavItem[] = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "employees", icon: Users },
  { href: "/attendance", label: "attendance", icon: Activity },
  { href: "/leave", label: "leave", icon: CalendarDays },
  { href: "/payroll", label: "payroll", icon: BriefcaseBusiness },
  { href: "/recruitment", label: "recruitment", icon: Users },
  { href: "/performance", label: "performance", icon: Award },
];
const secondary: NavItem[] = [
  { href: "/organization", label: "organizationStructure", icon: Building2 },
  { href: "/contracts", label: "contracts", icon: FileSignature },
  { href: "/workflows", label: "workflows", icon: Workflow },
  { href: "/documents", label: "documents", icon: FileText },
  { href: "/reports", label: "reports", icon: ClipboardCheck },
  { href: "/settings", label: "settings", icon: Settings },
];

function externalUrl(key: string, fallback: string) { return process.env[key] || fallback; }

export function HrShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, loading, error, refresh } = useHrWorkspace();
  const { t, locale, setLocale } = useHrLocale();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<"company" | "notifications" | null>(null);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body?: string | null; read_at?: string | null }>>([]);
  const [search, setSearch] = useState("");
  const [controlAccess, setControlAccess] = useState(false);

  useEffect(() => {
    const client = createClient();
    const userId = workspace?.user?.id;
    if (!client || !workspace?.companyId || !userId) return;
    let active = true;
    void client.from("hr_notifications").select("id,title,body,read_at").eq("company_id", workspace.companyId).eq("user_id", userId).order("created_at", { ascending: false }).limit(8).then(({ data }) => { if (active) setNotifications((data || []) as typeof notifications); });
    const channel = client.channel(`operix-hr-notifications:${workspace.companyId}`).on("postgres_changes", { event: "*", schema: "public", table: "hr_notifications", filter: `user_id=eq.${userId}` }, () => {
      void client.from("hr_notifications").select("id,title,body,read_at").eq("company_id", workspace.companyId).eq("user_id", userId).order("created_at", { ascending: false }).limit(8).then(({ data }) => setNotifications((data || []) as typeof notifications));
    }).subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }, [workspace?.companyId, workspace?.user]);

  useEffect(() => {
    const client = createClient();
    if (!client || !workspace?.companyId) {
      setControlAccess(false);
      return;
    }
    let active = true;
    void client.rpc("control_has_permission", { p_company_id: workspace.companyId, p_permission: "control.access" }).then(({ data }) => {
      if (active) setControlAccess(data === true);
    });
    return () => { active = false; };
  }, [workspace?.companyId]);

  const firstName = workspace?.profile.first_name || workspace?.profile.email?.split("@")[0] || "there";
  const companyName = workspace?.company?.company_name || workspace?.company?.name || "Your workspace";
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const renderSidebarLink = ({ href, className, children, onClick, "aria-current": ariaCurrent }: OperixSidebarLinkProps) => <Link href={href} className={className} onClick={onClick} aria-current={ariaCurrent}>{children}</Link>;
  const renderTopbarLink = ({ href, className, children, onClick, "aria-label": ariaLabel }: { href: string; className: string; children: React.ReactNode; onClick?: () => void; "aria-label"?: string }) => <Link href={href} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</Link>;

  function isActive(item: NavItem) { return pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)); }

  async function signOut() {
    const client = createClient();
    if (client) await client.auth.signOut({ scope: "local" }).catch(() => {});
    router.push("/login");
  }

  async function switchCompany(companyId: string) {
    const client = createClient();
    if (!client || companyId === workspace?.companyId) { setMenu(null); return; }
    const { error: switchError } = await client.rpc("set_active_company", { p_company_id: companyId });
    if (!switchError) { setMenu(null); await refresh(); router.refresh(); }
  }

  const appLinks = useMemo(() => [
    ...(controlAccess ? [{ label: "OperiX Control", href: externalUrl("NEXT_PUBLIC_OPERIX_CONTROL_URL", "https://control.operixsuite.com"), tone: "control", icon: ShieldCheck }] : []),
    { label: "OperiX Suite", href: externalUrl("NEXT_PUBLIC_OPERIX_SUITE_URL", "https://suite.operixsuite.com"), tone: "suite", icon: Grid2X2 },
    { label: "OperiX Invoice", href: externalUrl("NEXT_PUBLIC_OPERIX_INVOICE_URL", "https://invoice.operixsuite.com"), tone: "invoice", icon: ReceiptText },
    { label: "OperiX HR", href: "/dashboard", tone: "hr", icon: UsersRound },
    { label: "OperiX Booking", href: externalUrl("NEXT_PUBLIC_OPERIX_BOOKING_URL", "https://booking.operixsuite.com"), tone: "booking", icon: CalendarDays },
    { label: "OperiX Desk", href: externalUrl("NEXT_PUBLIC_OPERIX_DESK_URL", "https://desk.operixsuite.com"), tone: "desk", icon: Armchair },
  ], [controlAccess]);

  if (loading && !workspace) return <div className="app-loading"><HrLogo /><span>Loading OperiX HR…</span></div>;
  if (error && !workspace) return <div className="app-loading"><div className="setup-card"><HrLogo /><h1>OperiX HR</h1><p>{error}</p><Link className="button button-primary" href="/login">Return to sign in</Link></div></div>;

  const topbarApps = appLinks.map((app) => { const Icon = app.icon; return { id: app.tone, label: app.label, href: app.href, current: app.tone === "hr", icon: <Icon size={14} strokeWidth={2.1} /> }; });
  const notificationSlot = menu === "notifications" ? <div className="popover notification-menu"><div className="popover-title"><strong>{t("notifications")}</strong><span>{unreadCount} unread</span></div>{notifications.length ? notifications.slice(0, 5).map((notification) => <div className={`notification-row ${notification.read_at ? "" : "unread"}`} key={notification.id}><span className="notification-dot" /><div><strong>{notification.title}</strong><p>{notification.body}</p></div></div>) : <p className="popover-empty">No notifications yet.</p>}</div> : null;
  return <OperixAppShell className="app-frame" mainClassName="main-shell" sidebar={<OperixSidebar
      logo={<HrLogo href="/dashboard" />}
      ariaLabel="HR navigation"
      navSections={[
        { label: "Workspace", items: primary.map((item) => ({ ...item, label: t(item.label), active: isActive(item) })) },
        { label: "Manage", items: secondary.filter((item) => item.href !== "/settings").map((item) => ({ ...item, label: t(item.label), active: isActive(item) })) },
      ]}
      settingsItem={{ label: t("settings"), href: "/settings", icon: Settings, active: isActive({ href: "/settings", label: "settings", icon: Settings }) }}
      workspaceName={companyName}
      workspaces={(workspace?.companies || []).map((company) => ({ id: company.id, name: company.company_name || company.name || "Organization" }))}
      activeWorkspaceId={workspace?.companyId}
      workspaceOpen={menu === "company"}
      onWorkspaceToggle={() => setMenu(menu === "company" ? null : "company")}
      onWorkspaceSelect={(id) => void switchCompany(id)}
      user={{ initials: firstName.slice(0, 2).toUpperCase(), name: firstName, role: "HR admin" }}
      theme={theme}
      onToggleTheme={toggleTheme}
      onSignOut={() => void signOut()}
      mobileOpen={mobileOpen}
      onCloseMobile={() => setMobileOpen(false)}
      renderLink={renderSidebarLink}
    /> } topbar={<OperixTopBar
      apps={topbarApps}
      search={{ value: search, onChange: setSearch, onKeyDown: (event) => { if (event.key === "Enter" && search.trim()) router.push(`/employees?search=${encodeURIComponent(search.trim())}`); }, placeholder: t("search"), ariaLabel: t("search") }}
      help={{ href: "/settings", label: "Help" }}
      notifications={{ count: unreadCount, onClick: () => setMenu(menu === "notifications" ? null : "notifications"), label: t("notifications") }}
      primaryAction={{ href: "/employees?create=1", label: "Add employee", icon: <Plus size={16} /> }}
      extraActions={<button type="button" onClick={() => setLocale(locale === "en" ? "sq" : "en")} className="hidden rounded-[9px] border border-slate-200 px-2.5 py-2 text-[11px] font-bold text-slate-600 hover:border-brand-200 hover:text-brand-700 sm:inline-flex" aria-label={t("language")}>{locale.toUpperCase()} · {t("switchLanguage")}</button>}
      user={{ initials: firstName.slice(0, 2).toUpperCase(), href: "/settings", label: "Open settings" }}
      onMobileMenu={() => setMobileOpen(true)}
      renderLink={renderTopbarLink}
    /> }>
    {notificationSlot}
    <div className="content-shell">{children}</div>
    <OperixMobileNavigation items={primary.slice(0, 4).map((item) => ({ href: item.href, label: t(item.label), icon: <item.icon size={19} />, active: isActive(item) }))} primaryAction={{ href: "/employees?create=1", label: "Add employee", icon: <Plus size={22} /> }} moreAction={{ label: "More", icon: <Grid2X2 size={19} />, onClick: () => setMobileOpen(true) }} renderLink={renderTopbarLink} />
  </OperixAppShell>;
}
