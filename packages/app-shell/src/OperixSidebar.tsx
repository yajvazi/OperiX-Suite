import type { ComponentType, MouseEventHandler, ReactNode } from "react";
import { ChevronDown, ChevronRight, CircleHelp, LogOut, Moon, Settings2, Sun, X } from "lucide-react";

export type OperixSidebarIcon = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

export type OperixSidebarItem = {
  href: string;
  label: string;
  icon: OperixSidebarIcon;
  active?: boolean;
};

export type OperixSidebarWorkspace = {
  id: string;
  name: string;
  initials?: string;
};

export type OperixSidebarLinkProps = {
  href: string;
  className: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;
  "aria-current"?: "page";
};

export type OperixSidebarProps = {
  logo: ReactNode;
  ariaLabel: string;
  navSections: Array<{ label: string; items: OperixSidebarItem[] }>;
  settingsItem: OperixSidebarItem;
  workspaceName: string;
  workspaces?: OperixSidebarWorkspace[];
  activeWorkspaceId?: string | null;
  workspaceOpen?: boolean;
  workspaceLoading?: boolean;
  onWorkspaceToggle?: () => void;
  onWorkspaceSelect?: (workspaceId: string) => void;
  user: { initials: string; name: string; role?: string };
  helpHref?: string;
  helpSubtitle?: string;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onSignOut?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  renderLink?: (props: OperixSidebarLinkProps) => ReactNode;
};

function defaultRenderLink({ href, className, children, onClick, "aria-current": ariaCurrent }: OperixSidebarLinkProps) {
  return <a href={href} className={className} onClick={onClick} aria-current={ariaCurrent}>{children}</a>;
}

export function OperixSidebar({
  logo,
  ariaLabel,
  navSections,
  settingsItem,
  workspaceName,
  workspaces = [],
  activeWorkspaceId,
  workspaceOpen = false,
  workspaceLoading = false,
  onWorkspaceToggle,
  onWorkspaceSelect,
  user,
  helpHref = "https://helpdesk.operixsuite.com",
  helpSubtitle = "Open help center",
  theme = "light",
  onToggleTheme,
  onSignOut,
  mobileOpen = false,
  onCloseMobile,
  renderLink = defaultRenderLink,
}: OperixSidebarProps) {
  const link = (item: OperixSidebarItem, extraClass = "") => {
    const Icon = item.icon;
    const active = item.active === true;
    return renderLink({
      href: item.href,
      className: `operix-shared-sidebar-link ${active ? "is-active" : ""} ${extraClass}`.trim(),
      onClick: onCloseMobile,
      "aria-current": active ? "page" : undefined,
      children: <><Icon size={18} strokeWidth={active ? 2.3 : 1.9} /><span>{item.label}</span>{active && <span className="operix-shared-sidebar-active-dot" aria-hidden="true" />}</>,
    });
  };

  return <>
    <aside className={`operix-shared-sidebar ${mobileOpen ? "is-open" : ""}`} aria-label={ariaLabel}>
      <div className="operix-shared-sidebar-brand">
        <div className="operix-shared-sidebar-brand-content">{logo}</div>
        {onCloseMobile ? <button type="button" className="operix-shared-sidebar-close" onClick={onCloseMobile} aria-label="Close navigation"><X size={19} /></button> : null}
      </div>

      <div className="operix-shared-sidebar-workspace-wrap">
        <button type="button" className="operix-shared-sidebar-workspace" onClick={onWorkspaceToggle} aria-label="Switch workspace" aria-expanded={workspaceOpen} aria-haspopup="dialog" disabled={workspaceLoading}>
          <span className="operix-shared-sidebar-workspace-avatar">{workspaceName.slice(0, 1).toUpperCase()}</span>
          <span className="operix-shared-sidebar-workspace-copy"><small>Workspace</small><strong>{workspaceName}</strong></span>
          <ChevronDown size={15} />
        </button>
        {workspaceOpen ? <div className="operix-shared-sidebar-popover" role="dialog" aria-label="Workspace switcher">
          {workspaces.length > 0 ? workspaces.map((workspace) => <button key={workspace.id} type="button" className={workspace.id === activeWorkspaceId ? "is-selected" : ""} onClick={() => onWorkspaceSelect?.(workspace.id)} disabled={workspaceLoading}>
            <span>{workspace.initials || workspace.name.slice(0, 1).toUpperCase()}</span>
            <strong>{workspace.name}</strong>
            {workspace.id === activeWorkspaceId ? <span className="operix-shared-sidebar-current-dot" aria-label="Current workspace" /> : null}
          </button>) : <p>Your OperiX organization</p>}
        </div> : null}
      </div>

      <nav className="operix-shared-sidebar-nav" aria-label={ariaLabel}>
        {navSections.map((section, sectionIndex) => <div className={`operix-shared-sidebar-section ${sectionIndex > 0 ? "is-secondary" : ""}`} key={section.label}>
          <span className="operix-shared-sidebar-section-label">{section.label}</span>
          {section.items.map((item) => <span className="operix-shared-sidebar-item" key={`${item.href}-${item.label}`}>{link(item)}</span>)}
        </div>)}
      </nav>

      <div className="operix-shared-sidebar-bottom">
        {link(settingsItem)}
        <a className="operix-shared-sidebar-help" href={helpHref} target={helpHref.startsWith("http") ? "_blank" : undefined} rel={helpHref.startsWith("http") ? "noreferrer" : undefined}>
          <CircleHelp size={17} aria-hidden="true" />
          <span><strong>Need a hand?</strong><small>{helpSubtitle}</small></span>
          <ChevronRight size={15} aria-hidden="true" />
        </a>
        <div className="operix-shared-sidebar-profile">
          <span className="operix-shared-sidebar-profile-avatar">{user.initials}</span>
          <span className="operix-shared-sidebar-profile-copy"><strong>{user.name}</strong>{user.role ? <small>{user.role}</small> : null}</span>
          {onToggleTheme ? <button type="button" className="operix-shared-sidebar-icon-button" onClick={onToggleTheme} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"} title={theme === "dark" ? "Use light mode" : "Use dark mode"}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button> : null}
          {onSignOut ? <button type="button" className="operix-shared-sidebar-icon-button" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button> : null}
        </div>
      </div>
    </aside>
    {mobileOpen && onCloseMobile ? <button type="button" className="operix-shared-sidebar-overlay" aria-label="Close navigation" onClick={onCloseMobile} /> : null}
  </>;
}
