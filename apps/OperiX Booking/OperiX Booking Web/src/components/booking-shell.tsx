"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Armchair, Bell, CalendarDays, ChevronRight, ClipboardList, Clock3,
  Grid2X2, LayoutDashboard, MoreHorizontal, Plus, ReceiptText, Settings2,
  ShieldCheck, Sparkles, Users, UsersRound, WalletCards,
} from "lucide-react";
import { OperixMobileNavigation, OperixSidebar, OperixTopBar, type OperixSidebarItem, type OperixSidebarLinkProps } from "@invoice-monorepo/app-shell";
import { createClient } from "@/lib/supabase/client";
import { useBookingData } from "@/lib/booking-context";
import { BookingLogo } from "./product-logo";
import { useTheme } from "./theme-provider";

type NavItem = OperixSidebarItem;
const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Bookings", href: "/bookings", icon: ClipboardList },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Services", href: "/services", icon: Sparkles },
  { label: "Resources", href: "/resources", icon: Grid2X2 },
  { label: "Staff", href: "/staff", icon: Users },
];
const secondaryNav: NavItem[] = [
  { label: "Payments", href: "/payments", icon: WalletCards },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Reports", href: "/reports", icon: Clock3 },
];
const mobileNav: NavItem[] = [primaryNav[0], primaryNav[1], primaryNav[2], { label: "More", href: "/settings", icon: MoreHorizontal }];
export function BookingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, company, companies, companyId, loading, error, demo } = useBookingData();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [controlAccess, setControlAccess] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setControlAccess(false);
      return;
    }
    const client = createClient();
    if (!client) {
      setControlAccess(false);
      return;
    }
    let active = true;
    void client.rpc("control_has_permission", { p_company_id: companyId, p_permission: "control.access" }).then(({ data }) => {
      if (active) setControlAccess(data === true);
    });
    return () => { active = false; };
  }, [companyId]);

  const appLinks = useMemo(() => [
    ...(controlAccess ? [{ label: "OperiX Control", href: process.env.NEXT_PUBLIC_OPERIX_CONTROL_URL || "https://control.operixsuite.com", tone: "control", icon: ShieldCheck }] : []),
    { label: "OperiX Suite", href: process.env.NEXT_PUBLIC_SUITE_APP_URL || "https://operixsuite.com", tone: "suite", icon: Grid2X2 },
    { label: "OperiX Invoice", href: process.env.NEXT_PUBLIC_INVOICE_APP_URL || "#", tone: "invoice", icon: ReceiptText },
    { label: "OperiX HR", href: process.env.NEXT_PUBLIC_HR_APP_URL || "#", tone: "hr", icon: UsersRound },
    { label: "OperiX Booking", href: "/dashboard", tone: "booking", icon: CalendarDays },
    { label: "OperiX Desk", href: process.env.NEXT_PUBLIC_DESK_APP_URL || "#", tone: "desk", icon: Armchair },
  ], [controlAccess]);

  const firstName = profile?.first_name || user?.user_metadata?.first_name || user?.email?.split("@")[0] || "there";
  const companyName = company?.company_name || company?.name || "Your workspace";
  const initials = (profile?.first_name?.[0] || firstName[0] || "J") + (profile?.last_name?.[0] || "");
  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  const renderSidebarLink = ({ href, className, children, onClick, "aria-current": ariaCurrent }: OperixSidebarLinkProps) => <Link href={href} className={className} onClick={onClick} aria-current={ariaCurrent}>{children}</Link>;
  const renderTopbarLink = ({ href, className, children, onClick, "aria-label": ariaLabel }: { href: string; className: string; children: React.ReactNode; onClick?: () => void; "aria-label"?: string }) => <Link href={href} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</Link>;

  async function signOut() {
    const client = createClient();
    if (client) await client.auth.signOut({ scope: "local" }).catch(() => {});
    router.push("/login");
  }

  return (
    <div className="booking-app">
      <OperixSidebar
        logo={<BookingLogo href="/dashboard" />}
        ariaLabel="Booking navigation"
        navSections={[
          { label: "Workspace", items: primaryNav.map((item) => ({ ...item, active: isActive(item.href) })) },
          { label: "Manage", items: secondaryNav.map((item) => ({ ...item, active: isActive(item.href) })) },
        ]}
        settingsItem={{ label: "Settings", href: "/settings", icon: Settings2, active: isActive("/settings") }}
        workspaceName={companyName}
        workspaces={companies.map((item) => ({ id: item.id, name: item.company_name || item.name || "Organization" }))}
        activeWorkspaceId={companyId}
        workspaceOpen={orgOpen}
        onWorkspaceToggle={() => setOrgOpen((value) => !value)}
        onWorkspaceSelect={() => { setOrgOpen(false); window.location.reload(); }}
        user={{ initials: initials.toUpperCase(), name: `${firstName} ${profile?.last_name || ""}`.trim(), role: "Booking admin" }}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={() => void signOut()}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        renderLink={renderSidebarLink}
      />
      <div className="booking-main">
        <OperixTopBar
          apps={appLinks.filter((app) => app.tone === "booking" || app.href !== "#").map((app) => { const Icon = app.icon; return { id: app.tone, label: app.label, href: app.href, current: app.tone === "booking", icon: <Icon size={14} strokeWidth={2.1} /> }; })}
          search={{ value: search, onChange: setSearch, placeholder: "Search bookings, customers…", ariaLabel: "Search bookings and customers" }}
          help={{ href: "/settings", label: "Help" }}
          notifications={{ href: "/notifications", count: 3 }}
          primaryAction={{ href: "/bookings/new", label: "New booking", icon: <Plus size={17} /> }}
          user={{ initials: initials.toUpperCase(), onClick: () => void signOut(), label: "Sign out" }}
          onMobileMenu={() => setSidebarOpen(true)}
          renderLink={renderTopbarLink}
        />
        <div className="booking-content">
          {demo && <div className="demo-banner"><Sparkles size={15} /><span>Preview workspace · connected data appears here when Supabase is configured.</span><button onClick={() => router.push("/settings")}>Workspace setup <ChevronRight size={14} /></button></div>}
          {loading && <div className="page-loading"><span className="spinner" />Loading your Booking workspace…</div>}
          {!loading && error && !demo && <div className="workspace-error"><strong>Booking workspace unavailable</strong><span>{error}</span><Link href="/login" className="secondary-button">Return to sign in</Link></div>}
          {!loading && (!error || demo) && children}
        </div>
        <OperixMobileNavigation
          items={mobileNav.map((item) => ({ href: item.href, label: item.label, icon: <item.icon size={19} />, active: isActive(item.href) }))}
          primaryAction={{ href: "/bookings/new", label: "Create new booking", icon: <Plus size={23} /> }}
          renderLink={renderTopbarLink}
        />
      </div>
    </div>
  );
}
