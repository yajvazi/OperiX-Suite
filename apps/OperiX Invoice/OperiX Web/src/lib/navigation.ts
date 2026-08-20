import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  Building2,
  CircleHelp,
  CreditCard,
  FileCheck2,
  FileText,
  HandCoins,
  Home,
  Landmark,
  Package,
  Plug,
  ReceiptText,
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
};

export type NavigationSection = {
  label: string;
  items: NavigationItem[];
};

export const primaryNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/pos", label: "POS", icon: ShoppingCart, description: "Sell products and take payment" },
];

export const navigationSections: NavigationSection[] = [
  {
    label: "Sales",
    items: [
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/quotes", label: "Quotes", icon: FileCheck2 },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/contracts", label: "Contracts", icon: ScrollText },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/expenses", label: "Expenses", icon: WalletCards },
      { href: "/vendors", label: "Vendors", icon: Store },
      { href: "/income", label: "Income", icon: HandCoins },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/accounting", label: "Accounting", icon: BookOpenCheck },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/tax-reports", label: "VAT / Tax", icon: ReceiptText },
      { href: "/payroll", label: "Payroll", icon: WalletCards },
      { href: "/settings?tab=compliance", label: "Fiscalization", icon: Landmark },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/settings?tab=templates", label: "Templates", icon: FileCheck2 },
      { href: "/settings?tab=company", label: "Company", icon: Building2 },
      { href: "/settings?tab=team", label: "Team / Users", icon: Users },
      { href: "/settings?tab=payments", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings2 },
      { href: "/help", label: "Help", icon: CircleHelp },
    ],
  },
];

export const mobileNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/sales", label: "Sales", icon: FileText },
  { href: "/pos", label: "POS", icon: ShoppingCart },
  { href: "/business", label: "Business", icon: Boxes },
  { href: "/more", label: "More", icon: Settings2 },
];

export const salesNavigation: NavigationItem[] = [
  { href: "/invoices", label: "Invoices", icon: FileText, description: "Create, send, and track invoices" },
  { href: "/quotes", label: "Quotes", icon: FileCheck2, description: "Turn proposals into work" },
  { href: "/customers", label: "Customers", icon: Users, description: "Keep customer history together" },
  { href: "/payments", label: "Payments", icon: CreditCard, description: "Record money received" },
];

export const businessNavigation: NavigationItem[] = [
  { href: "/products", label: "Products", icon: Package, description: "Products and services" },
  { href: "/inventory", label: "Inventory", icon: Boxes, description: "See stock information" },
  { href: "/expenses", label: "Expenses", icon: WalletCards, description: "Track operating costs" },
  { href: "/vendors", label: "Vendors", icon: Store, description: "Manage suppliers" },
  { href: "/income", label: "Income", icon: HandCoins, description: "Record other income" },
];

export const moreNavigation: Array<{ title: string; items: NavigationItem[] }> = [
  {
    title: "Finance",
    items: navigationSections.find((section) => section.label === "Finance")?.items || [],
  },
  {
    title: "Documents",
    items: [
      { href: "/contracts", label: "Contracts", icon: ScrollText, description: "Customer agreements" },
      { href: "/settings?tab=templates", label: "Templates", icon: FileCheck2, description: "Invoice and contract templates" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/settings?tab=company", label: "Company", icon: Building2, description: "Company profile and switching" },
      { href: "/settings?tab=team", label: "Team / Users", icon: Users, description: "Workspace access" },
      { href: "/settings?tab=payments", label: "Integrations", icon: Plug, description: "Connected services" },
      { href: "/settings", label: "Settings", icon: Settings2, description: "Preferences and security" },
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
