import { POS_ENABLED } from "@/lib/features";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  Building2,
  CircleHelp,
  Code2,
  CreditCard,
  FileCheck2,
  FileText,
  HandCoins,
  Home,
  Landmark,
  Package,
  Plug,
  ScrollText,
  Settings2,
  ShoppingCart,
  Store,
  Users,
  WalletCards,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  permission?: string;
  /** Shown when the user holds any one of these. */
  anyPermission?: string[];
};

export type NavigationSection = {
  label: string;
  items: NavigationItem[];
};

export const primaryNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  ...(POS_ENABLED ? [{ href: "/pos", label: "POS", icon: ShoppingCart, description: "Sell products and take payment", permission: "payment.create" }] : []),
];

export const navigationSections: NavigationSection[] = [
  {
    label: "Sales",
    items: [
      { href: "/invoices", label: "Invoices", icon: FileText, permission: "invoice.view" },
      { href: "/quotes", label: "Quotes", icon: FileCheck2, permission: "offer.create" },
      { href: "/customers", label: "Customers", icon: Users, permission: "customer.view" },
      { href: "/payments", label: "Payments", icon: CreditCard, permission: "payment.view" },
      { href: "/contracts", label: "Contracts", icon: ScrollText, permission: "contracts.manage" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/products", label: "Products", icon: Package, permission: "product.view" },
      { href: "/expenses", label: "Expenses", icon: WalletCards, permission: "expense.view_own" },
      { href: "/vendors", label: "Vendors", icon: Store, permission: "expense.view_own" },
      { href: "/income", label: "Income", icon: HandCoins, permission: "payment.create" },
    ],
  },
    {
      label: "Finance",
      items: [
      { href: "/cash-bank", label: "Cash & Bank", icon: Landmark, description: "Cash, bank accounts, transfers and reconciliation", permission: "settings.bank" },
      { href: "/accounting", label: "Accounting", icon: BookOpenCheck, permission: "accounting_period.view" },
      { href: "/reports", label: "Reports & Taxes", icon: BarChart3, anyPermission: ["reports.operational", "reports.profit", "reports.tax", "sales_book.view"] },
      { href: "/payroll", label: "Payroll", icon: WalletCards, permission: "users.view" },
      { href: "/settings?tab=compliance", label: "Fiscalization", icon: Landmark, permission: "settings.tax" },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/settings?tab=templates", label: "Templates", icon: FileCheck2, permission: "settings.invoice" },
      { href: "/settings?tab=company", label: "Company", icon: Building2, permission: "settings.company" },
      { href: "/settings?tab=team", label: "Team / Users", icon: Users, permission: "users.view" },
      { href: "/settings?tab=payments", label: "Integrations", icon: Plug, permission: "settings.integrations" },
      { href: "/settings?tab=developers", label: "Developers", icon: Code2, permission: "settings.integrations" },
      { href: "/settings", label: "Settings", icon: Settings2, permission: "settings.company" },
      { href: "/help", label: "Help", icon: CircleHelp },
    ],
  },
];

export const mobileNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/sales", label: "Sales", icon: FileText },
  ...(POS_ENABLED ? [{ href: "/pos", label: "POS", icon: ShoppingCart }] : []),
  { href: "/business", label: "Business", icon: Boxes },
  { href: "/more", label: "More", icon: Settings2 },
];

export const salesNavigation: NavigationItem[] = [
  { href: "/invoices", label: "Invoices", icon: FileText, description: "Create, send, and track invoices", permission: "invoice.view" },
  { href: "/quotes", label: "Quotes", icon: FileCheck2, description: "Turn proposals into work", permission: "offer.create" },
  { href: "/customers", label: "Customers", icon: Users, description: "Keep customer history together", permission: "customer.view" },
  { href: "/payments", label: "Payments", icon: CreditCard, description: "Record money received", permission: "payment.view" },
];

export const businessNavigation: NavigationItem[] = [
  { href: "/products", label: "Products", icon: Package, description: "Products and services", permission: "product.view" },
  { href: "/expenses", label: "Expenses", icon: WalletCards, description: "Track operating costs", permission: "expense.view_own" },
  { href: "/vendors", label: "Vendors", icon: Store, description: "Manage suppliers", permission: "expense.view_own" },
  { href: "/income", label: "Income", icon: HandCoins, description: "Record other income", permission: "payment.create" },
];

export const moreNavigation: Array<{ title: string; items: NavigationItem[] }> = [
  {
    title: "Finance",
    items: navigationSections.find((section) => section.label === "Finance")?.items || [],
  },
  {
    title: "Documents",
    items: [
      { href: "/contracts", label: "Contracts", icon: ScrollText, description: "Customer agreements", permission: "contracts.manage" },
      { href: "/settings?tab=templates", label: "Templates", icon: FileCheck2, description: "Invoice and contract templates", permission: "settings.invoice" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/settings?tab=company", label: "Company", icon: Building2, description: "Company profile and switching", permission: "settings.company" },
      { href: "/settings?tab=team", label: "Team / Users", icon: Users, description: "Workspace access", permission: "users.view" },
      { href: "/settings?tab=billing", label: "Billing & Subscription", icon: CreditCard, description: "Trial, plan, usage, and subscription management", permission: "subscription.manage" },
      { href: "/settings?tab=payments", label: "Integrations", icon: Plug, description: "Connected services", permission: "settings.integrations" },
      { href: "/settings?tab=developers", label: "Developers", icon: Code2, description: "API keys, webhooks, usage, and docs", permission: "settings.integrations" },
      { href: "/settings", label: "Settings", icon: Settings2, description: "Preferences and security", permission: "settings.company" },
    ],
  },
  {
    title: "Support",
    items: [{ href: "/help", label: "Help", icon: CircleHelp, description: "Get help with OperiX Invoice" }],
  },
];

export function isNavigationItemActive(pathname: string, href: string) {
  const cleanHref = href.split("?")[0];
  if (cleanHref === "/dashboard") return pathname === "/dashboard";
  return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
}
