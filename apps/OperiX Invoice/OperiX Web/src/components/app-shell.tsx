"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Armchair,
  Bell,
  CalendarDays,
  FileCheck2,
  FileText,
  Grid2X2,
  HandCoins,
  LogOut,
  MoreHorizontal,
  Moon,
  Package,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Settings2,
  Sun,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { OperixMobileNavigation, OperixSidebar, OperixTopBar, type OperixSidebarLinkProps } from "@invoice-monorepo/app-shell";
import { InvoiceLogo } from "./product-logo";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useBusinessData } from "@/hooks/use-business-data";
import type { InvoiceRow } from "@/lib/models";
import { useTheme } from "./theme-provider";
import {
  mobileNavigation,
  navigationSections,
  primaryNavigation,
  isNavigationItemActive,
  type NavigationItem,
} from "@/lib/navigation";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type SearchGroup = { label: string; items: SearchResult[] };
type SearchResult = { id: string; label: string; meta: string; href: string; icon: NavigationItem["icon"] };

function externalUrl(key: string, fallback: string) {
  return process.env[key] || fallback;
}

const createActions: Array<{ label: string; description: string; href: string; icon: NavigationItem["icon"] }> = [
  { label: "Invoice", description: "Create and send an invoice", href: "/invoices/new", icon: FileText },
  { label: "Quote", description: "Prepare a proposal", href: "/invoices/new?type=offer", icon: FileCheck2 },
  { label: "Customer", description: "Add a customer record", href: "/customers?create=1", icon: UserRound },
  { label: "Product", description: "Add a product or service", href: "/products?create=1", icon: Package },
  { label: "Expense", description: "Record an operating cost", href: "/expenses?create=1", icon: WalletCards },
  { label: "Payment", description: "Record money received", href: "/payments?create=1", icon: HandCoins },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const invoicesQuery = useBusinessData<InvoiceRow>("invoices", "id,invoice_number,total_amount,status,due_date,client:clients(name)");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [controlAccess, setControlAccess] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(new Set());
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [companySwitching, setCompanySwitching] = useState(false);
  const [companySwitchError, setCompanySwitchError] = useState("");
  const mobileCreateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setCreateOpen(false);
        setNotificationsOpen(false);
        setCompanyOpen(false);
        setProfileOpen(false);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setCreateOpen(false);
        setNotificationsOpen(false);
        setCompanyOpen(false);
        setProfileOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!createOpen && !notificationsOpen && !companyOpen && !profileOpen) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mobileCreateMenuRef.current?.contains(target)) return;
      setCreateOpen(false);
      setNotificationsOpen(false);
      setCompanyOpen(false);
      setProfileOpen(false);
    };

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [companyOpen, createOpen, notificationsOpen, profileOpen]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !workspace.companyId) {
      return;
    }
    let active = true;
    void supabase.rpc("control_has_permission", { p_company_id: workspace.companyId, p_permission: "control.access" }).then(({ data }) => {
      if (active) setControlAccess(data === true);
    });
    return () => { active = false; };
  }, [workspace.companyId]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2 || workspace.loading || !workspace.user || !workspace.companyIds.length) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const supabase = createClient();
      if (!supabase) return;
      const scope = `and(user_id.eq.${workspace.user!.id},company_id.is.null),company_id.in.(${workspace.companyIds.join(",")})`;
      void Promise.all([
        supabase.from("invoices").select("id,invoice_number,total_amount,status,client:clients(name)").or(scope).ilike("invoice_number", `%${normalized}%`).limit(6),
        supabase.from("clients").select("id,name,email").or(scope).ilike("name", `%${normalized}%`).limit(6),
        supabase.from("products").select("id,name,sku,unit_price").or(scope).or(`name.ilike.%${normalized}%,sku.ilike.%${normalized}%`).limit(6),
        supabase.from("payments").select("id,payment_number,amount,payment_date,client:clients(name)").or(scope).ilike("payment_number", `%${normalized}%`).limit(6),
        supabase.from("vendors").select("id,name,email").or(scope).ilike("name", `%${normalized}%`).limit(6),
      ]).then(([invoices, clients, products, payments, vendors]) => {
        if (!active) return;
        const groups: SearchGroup[] = [];
        const invoiceItems = (invoices.data || []).map((row) => ({
          id: String(row.id),
          label: String(row.invoice_number),
          meta: `${relationName(row.client)} · ${moneyValue(row.total_amount)}`,
          href: `/invoices/${row.id}`,
          icon: FileText,
        }));
        const clientItems = (clients.data || []).map((row) => ({
          id: String(row.id),
          label: String(row.name),
          meta: String(row.email || "Customer"),
          href: "/customers",
          icon: UserRound,
        }));
        const productItems = (products.data || []).map((row) => ({
          id: String(row.id),
          label: String(row.name),
          meta: `${row.sku ? `${row.sku} · ` : ""}${moneyValue(row.unit_price)}`,
          href: "/products",
          icon: Package,
        }));
        const paymentItems = (payments.data || []).map((row) => ({
          id: String(row.id),
          label: String(row.payment_number),
          meta: `${relationName(row.client)} · ${moneyValue(row.amount)}`,
          href: "/payments",
          icon: HandCoins,
        }));
        const vendorItems = (vendors.data || []).map((row) => ({
          id: String(row.id),
          label: String(row.name),
          meta: String(row.email || "Vendor"),
          href: "/vendors",
          icon: UserRound,
        }));
        if (invoiceItems.length) groups.push({ label: "Invoices", items: invoiceItems });
        if (clientItems.length) groups.push({ label: "Customers", items: clientItems });
        if (productItems.length) groups.push({ label: "Products", items: productItems });
        if (paymentItems.length) groups.push({ label: "Payments", items: paymentItems });
        if (vendorItems.length) groups.push({ label: "Vendors", items: vendorItems });
        setSearchGroups(groups);
        setSearchIndex(0);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, workspace.companyIds, workspace.loading, workspace.user]);

  const searchItems = useMemo(() => searchGroups.flatMap((group) => group.items), [searchGroups]);
  const notifications = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return invoicesQuery.data
      .filter((invoice) => {
        if (dismissedNotificationIds.has(invoice.id) || ["paid", "cancelled"].includes(invoice.status) || !invoice.due_date) return false;
        const due = new Date(invoice.due_date);
        return due < now || due <= end;
      })
      .map((invoice) => ({ invoice, overdue: new Date(invoice.due_date || "") < now }));
  }, [dismissedNotificationIds, invoicesQuery.data]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    setSearchGroups([]);
    setSearchIndex(0);
  }

  function handleSearchChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setSearchGroups([]);
      setSearchIndex(0);
    }
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchIndex((current) => Math.min(current + 1, Math.max(searchItems.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter" && searchItems[searchIndex]) {
      event.preventDefault();
      router.push(searchItems[searchIndex].href);
      closeSearch();
    }
  }

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  async function switchCompany(companyId: string) {
    setCompanyOpen(false);
    setCompanySwitchError("");
    if (companyId === workspace.companyId) return;

    const supabase = createClient();
    if (!supabase || !workspace.user) {
      setCompanySwitchError("Your workspace is not ready. Please try again.");
      return;
    }

    setCompanySwitching(true);
    try {
      const { error } = await supabase.rpc("set_active_company", { p_company_id: companyId });
      if (error) {
        setCompanySwitchError(companySwitchErrorMessage(error.message));
        return;
      }

      // Every data hook owns its workspace state. A full reload guarantees that
      // all lists move to the new tenant scope together, not just the shell.
      window.location.reload();
    } catch {
      setCompanySwitchError("We could not switch companies. Please try again.");
    } finally {
      setCompanySwitching(false);
    }
  }

  function toggleCreateMenu() {
    const next = !createOpen;
    setCreateOpen(next);
    if (next) {
      setNotificationsOpen(false);
      setCompanyOpen(false);
        setProfileOpen(false);
    }
  }

  function toggleNotifications() {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    if (next) {
      setCreateOpen(false);
      setCompanyOpen(false);
      setProfileOpen(false);
    }
  }

  function toggleCompany() {
    const next = !companyOpen;
    setCompanyOpen(next);
    setCompanySwitchError("");
    if (next) {
      setCreateOpen(false);
      setNotificationsOpen(false);
      setProfileOpen(false);
    }
  }

  function toggleProfile() {
    const next = !profileOpen;
    setProfileOpen(next);
    if (next) {
      setCreateOpen(false);
      setNotificationsOpen(false);
      setCompanyOpen(false);
    }
  }

  const companies = useMemo(() => workspace.companies.map((company) => ({
    id: company.id,
    name: String(company.company_name || company.name || "Company"),
    parentId: company.parent_company_id || null,
  })), [workspace.companies]);

  const appLinks = useMemo(() => [
    ...(controlAccess ? [{ label: "OperiX Control", href: externalUrl("NEXT_PUBLIC_OPERIX_CONTROL_URL", "https://control.operixsuite.com"), tone: "control", icon: ShieldCheck }] : []),
    { label: "OperiX Suite", href: externalUrl("NEXT_PUBLIC_OPERIX_SUITE_URL", "https://suite.operixsuite.com"), tone: "suite", icon: Grid2X2 },
    { label: "OperiX Invoice", href: "/dashboard", current: true, tone: "invoice", icon: ReceiptText },
    { label: "OperiX HR", href: externalUrl("NEXT_PUBLIC_OPERIX_HR_URL", "https://hr.operixsuite.com"), tone: "hr", icon: UsersRound },
    { label: "OperiX Booking", href: externalUrl("NEXT_PUBLIC_OPERIX_BOOKING_URL", "https://booking.operixsuite.com"), tone: "booking", icon: CalendarDays },
    { label: "OperiX Desk", href: externalUrl("NEXT_PUBLIC_OPERIX_DESK_URL", "https://desk.operixsuite.com"), tone: "desk", icon: Armchair },
  ], [controlAccess]);

  const companyName = workspace.company?.company_name || workspace.company?.name || workspace.profile?.company_name || "OperiX workspace";
  const firstName = workspace.profile?.first_name || workspace.user?.email?.split("@")[0] || "there";
  const invoiceSidebarItems = [...primaryNavigation, ...navigationSections.flatMap((section) => section.items).filter((item) => item.href !== "/settings" && item.href !== "/help")];
  const renderSidebarLink = ({ href, className, children, onClick, "aria-current": ariaCurrent }: OperixSidebarLinkProps) => <Link href={href} className={className} onClick={onClick} aria-current={ariaCurrent}>{children}</Link>;
  const renderTopbarLink = ({ href, className, children, onClick, "aria-label": ariaLabel }: { href: string; className: string; children: React.ReactNode; onClick?: () => void; "aria-label"?: string }) => <Link href={href} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</Link>;
  const topbarApps = appLinks.map((app) => { const Icon = app.icon; return { id: app.tone, label: app.label, href: app.href, current: app.current, icon: <Icon size={14} strokeWidth={2.1} /> }; });

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  return (
    <div className="app-shell">
      <OperixSidebar
        logo={<InvoiceLogo href="/dashboard" />}
        ariaLabel="Invoice navigation"
        navSections={[
          { label: "Workspace", items: primaryNavigation.map((item) => ({ ...item, active: isNavigationItemActive(pathname, item.href) })) },
          { label: "Manage", items: invoiceSidebarItems.slice(primaryNavigation.length).map((item) => ({ ...item, active: isNavigationItemActive(pathname, item.href) })) },
        ]}
        settingsItem={{ label: "Settings", href: "/settings", icon: Settings2, active: isNavigationItemActive(pathname, "/settings") }}
        workspaceName={companyName}
        workspaces={companies.map((company) => ({ id: company.id, name: company.name, initials: initials(company.name) }))}
        activeWorkspaceId={workspace.companyId}
        workspaceOpen={companyOpen}
        workspaceLoading={companySwitching}
        onWorkspaceToggle={toggleCompany}
        onWorkspaceSelect={(id) => void switchCompany(id)}
        user={{ initials: initials(firstName), name: firstName, role: "Invoice admin" }}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={() => void signOut()}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        renderLink={renderSidebarLink}
      />

      <div className="app-content">
        <OperixTopBar
          apps={topbarApps}
          search={{ value: query, onChange: handleSearchChange, onClick: () => setSearchOpen(true), onFocus: () => setSearchOpen(true), onKeyDown: handleSearchKeyDown, placeholder: "Search invoices, customers, products…", ariaLabel: "Open global search" }}
          help={{ href: "/help", label: "Help" }}
          notifications={{ count: notifications.length, onClick: toggleNotifications, label: "Notifications", slot: notificationsOpen ? <NotificationPopover notifications={notifications} loading={invoicesQuery.loading} onClose={() => setNotificationsOpen(false)} onClear={() => { setDismissedNotificationIds(new Set(notifications.map((item) => item.invoice.id))); setNotificationsOpen(false); }} /> : null }}
          extraActions={<>{installEvent ? <button type="button" className="operix-icon-button app-install-action" onClick={() => void install()} aria-label="Install OperiX"><Package size={17} /></button> : null}<div className="app-create-desktop" style={{ position: "relative" }}><button type="button" className="operix-button operix-button-primary operix-button-md app-topbar-primary" onClick={toggleCreateMenu} aria-expanded={createOpen} aria-haspopup="dialog"><Plus size={16} /><span>Create</span></button>{createOpen ? <CreateMenu onClose={() => setCreateOpen(false)} /> : null}</div></>}
          user={{ initials: initials(workspace.user?.email || "You"), onClick: toggleProfile, label: "Open profile menu", slot: profileOpen ? <ProfilePopover email={workspace.user?.email || "Account"} theme={theme} onToggleTheme={toggleTheme} onClose={() => setProfileOpen(false)} onSignOut={() => void signOut()} /> : null }}
          onMobileMenu={() => setMobileOpen(true)}
          renderLink={renderTopbarLink}
        />
        <main className="app-main">{children}</main>
      </div>

      <OperixMobileNavigation items={mobileNavigation.slice(0, 4).map((item) => ({ href: item.href, label: item.label, icon: <item.icon size={19} />, active: isNavigationItemActive(pathname, item.href) }))} primaryAction={pathname === "/pos" ? undefined : { href: "/invoices/new", label: "Create invoice", icon: <Plus size={22} /> }} moreAction={{ label: "More", icon: <MoreHorizontal size={19} />, onClick: () => router.push("/more") }} renderLink={renderTopbarLink} />
      {createOpen && <div className="app-mobile-create-menu" ref={mobileCreateMenuRef}><CreateMenu onClose={() => setCreateOpen(false)} /></div>}

      {companySwitchError ? <div className="app-shell-alert" role="alert" aria-live="polite"><span>{companySwitchError}</span><button type="button" onClick={() => setCompanySwitchError("")} aria-label="Dismiss company switch error"><X size={15} /></button></div> : null}

      {searchOpen ? <div className="app-search-overlay" onMouseDown={closeSearch}>
        <section className="app-search-dialog" role="dialog" aria-modal="true" aria-label="Global search" onMouseDown={(event) => event.stopPropagation()}>
          <div className="app-search-dialog-input"><Search size={18} aria-hidden="true" /><input autoFocus value={query} onChange={(event) => handleSearchChange(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Search invoices, customers, products…" /><button type="button" className="app-topbar-icon" onClick={closeSearch} aria-label="Close search"><X size={17} /></button></div>
          <div className="app-search-dialog-body">
            {!query.trim() ? <div className="app-search-empty">Type at least two characters to search your workspace.</div> : null}
            {query.trim() && !searchGroups.length ? <div className="app-search-empty">No invoices, customers, products, payments, or vendors found.</div> : null}
            {searchGroups.map((group) => <div key={group.label}><div className="app-search-group-label">{group.label}</div>{group.items.map((item) => { const Icon = item.icon; const flatIndex = searchItems.findIndex((entry) => entry.id === item.id && entry.label === item.label); return <Link key={`${group.label}-${item.id}`} href={item.href} className={`app-search-result ${flatIndex === searchIndex ? "is-selected" : ""}`} onClick={closeSearch}><span className="app-search-result-icon"><Icon size={16} /></span><span><strong>{item.label}</strong><small>{item.meta}</small></span></Link>; })}</div>)}
          </div>
        </section>
      </div> : null}
    </div>
  );
}

function CreateMenu({ onClose }: { onClose: () => void }) {
  return <div className="app-create-menu" role="dialog" aria-label="Create new">
    <div className="app-create-menu-header"><strong>Create new</strong><span>Start a common business task.</span></div>
    {createActions.map((action) => { const Icon = action.icon; return <Link key={action.label} href={action.href} className="app-create-option" onClick={onClose}><span className="app-create-option-icon"><Icon size={17} /></span><span><strong>{action.label}</strong><small>{action.description}</small></span></Link>; })}
  </div>;
}

function NotificationPopover({ notifications, loading, onClose, onClear }: { notifications: Array<{ invoice: InvoiceRow; overdue: boolean }>; loading: boolean; onClose: () => void; onClear: () => void }) {
  return <div className="app-popover" role="dialog" aria-label="Notifications">
    <div className="app-popover-title"><strong>Needs attention</strong><span className="app-popover-subtle">Next 7 days</span></div>
    {loading ? <div className="app-search-empty">Loading notifications…</div> : notifications.length ? <>{notifications.map(({ invoice, overdue }) => <Link key={invoice.id} href={`/invoices/${invoice.id}`} onClick={onClose} className="app-popover-link"><Bell size={15} /><span><strong>{overdue ? "Overdue invoice" : "Invoice due soon"}</strong><small>{invoice.invoice_number} · {invoice.client?.name || "Customer"}</small></span></Link>)}<button type="button" className="app-popover-button" onClick={onClear}><X size={15} /> Clear notifications</button></> : <div className="app-search-empty">You’re all caught up.</div>}
  </div>;
}

function ProfilePopover({ email, theme, onToggleTheme, onClose, onSignOut }: { email: string; theme: "light" | "dark"; onToggleTheme: () => void; onClose: () => void; onSignOut: () => void }) {
  return <div className="app-popover" role="dialog" aria-label="Profile menu"><div className="app-popover-title"><strong>Your account</strong><span className="app-popover-subtle">{email}</span></div><Link className="app-popover-link" href="/settings?tab=general" onClick={onClose}><UserRound size={15} /> Profile and preferences</Link><button type="button" className="app-popover-button" onClick={onToggleTheme}>{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} {theme === "dark" ? "Use light mode" : "Use dark mode"}</button><button type="button" className="app-popover-button is-danger" onClick={onSignOut}><LogOutIcon /> Sign out</button></div>;
}

function LogOutIcon() { return <LogOut size={15} aria-hidden="true" />; }
function relationName(value: unknown) { const relation = Array.isArray(value) ? value[0] : value; return relation && typeof relation === "object" ? String((relation as Record<string, unknown>).name || "Customer") : "Customer"; }
function moneyValue(value: unknown) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value) || 0); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "O"; }
function companySwitchErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("not a member") || normalized.includes("permission") || normalized.includes("access")) {
    return "You do not have access to that company.";
  }
  if (normalized.includes("authentication") || normalized.includes("session")) {
    return "Your session has expired. Please sign in again.";
  }
  return "We could not switch companies. Please try again.";
}

export const secondaryModules = [
  { href: "/supplier-bills", label: "Supplier Bills", icon: FileText },
  { href: "/contracts", label: "Contracts", icon: FileCheck2 },
  { href: "/management", label: "Management", icon: MoreHorizontal },
  { href: "/inventory", label: "Inventory", icon: Package },
];
