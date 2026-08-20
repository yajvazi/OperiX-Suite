import {
  Activity,
  Armchair,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Code2,
  Database,
  FileClock,
  Gauge,
  Globe2,
  Grid2X2,
  Link2,
  LockKeyhole,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ControlPermission, ControlView } from "./control-types";
import { appUrls } from "./supabase/config";
import { safeExternalAppUrl } from "./safe-navigation";

export type NavItem = {
  view: ControlView;
  label: string;
  description: string;
  icon: LucideIcon;
  permission?: ControlPermission;
};

export const navigation: NavItem[] = [
  { view: "overview", label: "Overview", description: "Organization health at a glance", icon: Gauge },
  { view: "organization", label: "Organization", description: "Business profile and structure", icon: Building2, permission: "organization.read" },
  { view: "users", label: "Users", description: "Members and invitations", icon: Users, permission: "users.read" },
  { view: "teams", label: "Teams & groups", description: "Shared access groups", icon: Users, permission: "teams.read" },
  { view: "roles", label: "Roles & permissions", description: "Access governance", icon: LockKeyhole, permission: "roles.read" },
  { view: "apps", label: "Apps", description: "Suite modules and access", icon: Grid2X2, permission: "apps.read" },
  { view: "integrations", label: "Integrations", description: "Connected services", icon: Link2, permission: "integrations.read" },
  { view: "automations", label: "Automations", description: "Cross-app workflows", icon: Activity, permission: "settings.read" },
  { view: "notifications", label: "Notifications", description: "Administrative alerts", icon: Bell, permission: "security.read" },
  { view: "billing", label: "Billing & plans", description: "Subscription and seats", icon: CircleDollarSign, permission: "billing.read" },
  { view: "usage", label: "Usage", description: "Measured product activity", icon: BarChart3, permission: "usage.read" },
  { view: "security", label: "Security", description: "Access and risk posture", icon: ShieldCheck, permission: "security.read" },
  { view: "audit", label: "Audit log", description: "Privileged administrative events", icon: FileClock, permission: "audit.read" },
  { view: "api", label: "API & webhooks", description: "Developer access", icon: Code2, permission: "api.read" },
  { view: "data", label: "Data & storage", description: "Retention and exports", icon: Database, permission: "data.read" },
  { view: "status", label: "System status", description: "Service health", icon: Globe2, permission: "status.read" },
  { view: "settings", label: "Settings", description: "Control preferences", icon: Settings, permission: "settings.read" },
];

export const launcherApps = [
  { key: "control", name: "OperiX Control", href: "/dashboard", icon: ShieldCheck, internal: true },
  { key: "suite", name: "OperiX Suite", href: appUrls.suite, icon: Grid2X2 },
  { key: "invoice", name: "OperiX Invoice", href: appUrls.invoice, icon: ReceiptText },
  { key: "hr", name: "OperiX HR", href: appUrls.hr, icon: UsersRound },
  { key: "booking", name: "OperiX Booking", href: appUrls.booking, icon: CalendarDays },
  { key: "desk", name: "OperiX Desk", href: appUrls.desk, icon: Armchair },
  { key: "support", name: "OperiX Support", href: appUrls.support, icon: Bell },
  { key: "crm", name: "OperiX CRM", href: appUrls.crm, icon: Users },
];

export function launcherHref(value: string) {
  return safeExternalAppUrl(value);
}

export const registryFallback = [
  { app_key: "invoice", display_name: "OperiX Invoice", description: "Invoicing and financial operations", icon_key: "invoice", route: appUrls.invoice },
  { app_key: "hr", display_name: "OperiX HR", description: "People, attendance, leave, and payroll", icon_key: "hr", route: appUrls.hr },
  { app_key: "booking", display_name: "OperiX Booking", description: "Appointments and reservations", icon_key: "booking", route: appUrls.booking },
  { app_key: "desk", display_name: "OperiX Desk", description: "Workspace reservations and utilization", icon_key: "desk", route: appUrls.desk },
  { app_key: "support", display_name: "OperiX Support", description: "Support inboxes and service workflows", icon_key: "support", route: appUrls.support },
  { app_key: "crm", display_name: "OperiX CRM", description: "Customer relationships and sales", icon_key: "crm", route: appUrls.crm },
];

export function canView(view: NavItem, permissions: Set<ControlPermission>) {
  return !view.permission || permissions.has(view.permission);
}

export function appIcon(key: string) {
  return ({ invoice: FileClock, hr: Users, booking: CalendarDays, desk: Building2, support: Bell, crm: Users } as Record<string, LucideIcon>)[key] || Grid2X2;
}

export function appLogoClass(key: string) {
  return `app-logo app-logo-${key}`;
}

export function roleLabel(code: string | null | undefined) {
  if (!code) return "Read only";
  if (code === "super_administrator" || code === "owner") return "Super admin";
  if (code === "company_administrator") return "Admin";
  if (code === "manager") return "Manager";
  if (code === "employee" || code === "worker") return "Employee";
  return code.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const delta = Date.now() - date.getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function displayName(firstName?: string | null, lastName?: string | null, fallback?: string | null) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || fallback || "OperiX user";
}
