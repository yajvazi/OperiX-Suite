import { Bell, ChevronDown, CircleHelp, Grid2X2, Menu, Search } from "lucide-react";
import * as React from "react";
import type { ReactNode } from "react";

export type OperixAppSwitcherItem = {
  id: string;
  label: string;
  href?: string;
  current?: boolean;
  available?: boolean;
  icon?: ReactNode;
};

export type OperixTopBarProps = {
  apps?: OperixAppSwitcherItem[];
  search?: { value: string; onChange?: (value: string) => void; onClick?: () => void; onFocus?: () => void; onBlur?: () => void; onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void; placeholder?: string; ariaLabel?: string; shortcut?: string; resultSlot?: ReactNode };
  breadcrumbs?: ReactNode;
  notifications?: { href?: string; count?: number; onClick?: () => void; label?: string; slot?: ReactNode };
  help?: { href: string; label?: string };
  primaryAction?: { href?: string; label: string; icon?: ReactNode; onClick?: () => void };
  user?: { initials: string; href?: string; onClick?: () => void; label?: string; slot?: ReactNode };
  extraActions?: ReactNode;
  onMobileMenu?: () => void;
  renderLink?: (props: { href: string; className: string; children: ReactNode; onClick?: () => void; "aria-label"?: string }) => ReactNode;
};

function defaultLink({ href, className, children, onClick, "aria-label": ariaLabel }: { href: string; className: string; children: ReactNode; onClick?: () => void; "aria-label"?: string }) {
  return <a href={href} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</a>;
}

export function OperixAppSwitcher({ apps = [] }: { apps?: OperixAppSwitcherItem[] }) {
  const [open, setOpen] = React.useState(false);
  return <div className="operix-shared-topbar-app-switcher"><button type="button" className="operix-shared-app-switcher-button" aria-expanded={open} aria-label="Open OperiX application switcher" onClick={() => setOpen((value) => !value)}><Grid2X2 size={17} /><span>Apps</span><ChevronDown size={14} /></button>{open ? <div className="operix-shared-topbar-popover" role="menu">{apps.map((app) => app.available === false ? <span key={app.id} className="operix-shared-app-link is-disabled"><span className="operix-shared-app-icon">{app.icon}</span><span>{app.label}</span><small>Unavailable</small></span> : <a key={app.id} href={app.href || "#"} className={`operix-shared-app-link ${app.current ? "is-current" : ""}`} onClick={() => setOpen(false)}>{app.icon ? <span className="operix-shared-app-icon">{app.icon}</span> : null}<span>{app.label}</span>{app.current ? <span className="operix-shared-app-current-dot" /> : null}</a>)}</div> : null}</div>;
}

export function OperixNotifications({ count = 0, label = "Notifications", onClick, children }: { count?: number; label?: string; onClick?: () => void; children?: ReactNode }) {
  return <span className="operix-shared-topbar-slot"><button type="button" className="operix-shared-topbar-notifications" onClick={onClick} aria-label={label}><Bell size={19} />{count ? <span className="operix-shared-notification-count">{count > 9 ? "9+" : count}</span> : null}</button>{children}</span>;
}

export function OperixUserMenu({ initials, label = "Open profile", onClick, children }: { initials: string; label?: string; onClick?: () => void; children?: ReactNode }) {
  return <span className="operix-shared-topbar-slot"><button type="button" className="operix-avatar operix-avatar-md operix-shared-topbar-user" onClick={onClick} aria-label={label}>{initials}</button>{children}</span>;
}

export function OperixTopBar({ apps, search, breadcrumbs, notifications, help, primaryAction, user, extraActions, onMobileMenu, renderLink = defaultLink }: OperixTopBarProps) {
  const link = (href: string, className: string, children: ReactNode, onClick?: () => void, ariaLabel?: string) => renderLink({ href, className, children, onClick, "aria-label": ariaLabel });
  const notificationContent = <><Bell size={19} />{notifications?.count ? <span className="operix-shared-notification-count">{notifications.count > 9 ? "9+" : notifications.count}</span> : null}</>;
  return <header className="operix-shared-topbar"><div className="operix-shared-topbar-leading">{onMobileMenu ? <button type="button" className="operix-shared-topbar-mobile-menu" aria-label="Open navigation" onClick={onMobileMenu}><Menu size={20} /></button> : null}<OperixAppSwitcher apps={apps} />{breadcrumbs ? <div className="operix-shared-topbar-breadcrumbs">{breadcrumbs}</div> : null}</div>{search ? <div className="operix-shared-topbar-search" onClick={search.onClick}><Search size={17} /><input type="search" value={search.value} onChange={(event) => search.onChange?.(event.target.value)} onFocus={search.onFocus} onBlur={search.onBlur} onKeyDown={search.onKeyDown} placeholder={search.placeholder || "Search workspace…"} aria-label={search.ariaLabel || search.placeholder || "Search workspace"} readOnly={!search.onChange} /><kbd>{search.shortcut || "⌘ K"}</kbd>{search.resultSlot}</div> : <div className="operix-shared-topbar-spacer" />}{<div className="operix-shared-topbar-actions">{help ? link(help.href, "operix-shared-topbar-help", <CircleHelp size={18} />, undefined, help.label || "Help") : null}{notifications ? <span className="operix-shared-topbar-slot">{notifications.href ? link(notifications.href, "operix-shared-topbar-notifications", notificationContent, undefined, notifications.label || "Notifications") : <button type="button" className="operix-shared-topbar-notifications" onClick={notifications.onClick} aria-label={notifications.label || "Notifications"}>{notificationContent}</button>}{notifications.slot}</span> : null}{primaryAction ? (primaryAction.href ? link(primaryAction.href, "operix-button operix-button-primary operix-button-md operix-shared-topbar-primary", <>{primaryAction.icon}{primaryAction.label}</>) : <button type="button" className="operix-button operix-button-primary operix-button-md operix-shared-topbar-primary" onClick={primaryAction.onClick}>{primaryAction.icon}{primaryAction.label}</button>) : null}{extraActions}{user ? <span className="operix-shared-topbar-slot">{user.href ? link(user.href, "operix-avatar operix-avatar-md operix-shared-topbar-user", user.initials, undefined, user.label || "Open profile") : <button type="button" className="operix-avatar operix-avatar-md operix-shared-topbar-user" onClick={user.onClick} aria-label={user.label || "Open profile"}>{user.initials}</button>}{user.slot}</span> : null}</div>}</header>;
}

export function OperixMobileNavigation({ items, primaryAction, moreAction, renderLink = defaultLink }: { items: Array<{ href: string; label: string; icon: ReactNode; active?: boolean }>; primaryAction?: { href: string; label?: string; icon: ReactNode }; moreAction?: { label: string; icon: ReactNode; onClick: () => void }; renderLink?: OperixTopBarProps["renderLink"] }) {
  const link = renderLink || defaultLink;
  return <nav className="operix-shared-mobile-navigation" aria-label="Mobile navigation">{items.map((item) => <React.Fragment key={item.href}>{link({ href: item.href, className: `operix-shared-mobile-navigation-link ${item.active ? "is-active" : ""}`, children: <>{item.icon}<span>{item.label}</span></>, "aria-label": item.label })}</React.Fragment>)}{primaryAction ? <React.Fragment key="primary">{link({ href: primaryAction.href, className: "operix-shared-mobile-navigation-primary", children: primaryAction.icon, "aria-label": primaryAction.label || "Create" })}</React.Fragment> : null}{moreAction ? <button key="more" type="button" className="operix-shared-mobile-navigation-link" onClick={moreAction.onClick} aria-label={moreAction.label}>{moreAction.icon}<span>{moreAction.label}</span></button> : null}</nav>;
}

export function OperixAppShell({ sidebar, topbar, children, className = "", mainClassName = "" }: { sidebar: ReactNode; topbar?: ReactNode; children: ReactNode; className?: string; mainClassName?: string }) {
  return <div className={`operix-app-shell ${className}`.trim()}>{sidebar}<main className={`operix-app-shell-main ${mainClassName}`.trim()}>{topbar}{children}</main></div>;
}

export function OperixPage({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={`operix-page ${className}`.trim()}>{children}</div>; }

export function OperixSettingsLayout({ navigation, children }: { navigation: ReactNode; children: ReactNode }) { return <div className="operix-settings-layout"><aside>{navigation}</aside><section>{children}</section></div>; }
