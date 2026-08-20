import {
  Armchair,
  CalendarCheck2,
  CalendarDays,
  Grid2X2,
  ReceiptText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ProductKey = "suite" | "control" | "invoice" | "hr" | "booking" | "desk";
export type ProductStatus = "available" | "beta" | "coming-soon";

export type ProductDefinition = {
  key: ProductKey;
  name: string;
  shortName: string;
  description: string;
  navigationDescription: string;
  marketingPath: string;
  applicationUrl: string;
  icon: LucideIcon;
  accent: string;
  hasWeb: boolean;
  hasMobile: boolean;
  status: ProductStatus;
  demoEnabled: boolean;
  demoUrl?: string;
  demoNote: string;
  featureGroups: { title: string; items: string[] }[];
};

function publicUrl(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

const authUrl = publicUrl("NEXT_PUBLIC_OPERIX_SIGN_IN_URL", "https://invoice.operixsuite.com/login");

export const productRegistry: Record<ProductKey, ProductDefinition> = {
  suite: {
    key: "suite",
    name: "OperiX Suite",
    shortName: "Suite",
    description: "Your connected workspace for accessing the OperiX ecosystem.",
    navigationDescription: "One workspace for every OperiX app",
    marketingPath: "/products/suite",
    applicationUrl: publicUrl("NEXT_PUBLIC_OPERIX_SUITE_URL", "https://suite.operixsuite.com"),
    icon: Grid2X2,
    accent: "#5b8cff",
    hasWeb: true,
    hasMobile: false,
    status: "available",
    demoEnabled: false,
    demoNote: "The Suite demo will open when the shared demo environment is enabled.",
    featureGroups: [
      { title: "Workspace", items: ["Unified OperiX account", "Organization context", "Application launcher"] },
      { title: "Access", items: ["Application access", "Recent activity", "Connected navigation"] },
    ],
  },
  control: {
    key: "control",
    name: "OperiX Control",
    shortName: "Control",
    description: "The administration and system management layer for the OperiX platform.",
    navigationDescription: "Administration and platform control",
    marketingPath: "/products/control",
    applicationUrl: publicUrl("NEXT_PUBLIC_OPERIX_CONTROL_URL", "https://control.operixsuite.com"),
    icon: ShieldCheck,
    accent: "#6c63ff",
    hasWeb: true,
    hasMobile: false,
    status: "available",
    demoEnabled: false,
    demoNote: "A restricted Control demo requires its own trusted demo session and is not linked to production.",
    featureGroups: [
      { title: "Organization", items: ["Organizations", "Users and roles", "Application access", "Teams"] },
      { title: "Governance", items: ["Permissions", "Security", "Integrations", "Audit logs", "System settings"] },
    ],
  },
  invoice: {
    key: "invoice",
    name: "OperiX Invoice",
    shortName: "Invoice",
    description: "Invoicing and financial operations for the day-to-day business.",
    navigationDescription: "Invoicing and business finance",
    marketingPath: "/products/invoice",
    applicationUrl: publicUrl("NEXT_PUBLIC_OPERIX_INVOICE_URL", "https://invoice.operixsuite.com"),
    icon: ReceiptText,
    accent: "#1e9c78",
    hasWeb: true,
    hasMobile: true,
    status: "available",
    demoEnabled: true,
    demoUrl: publicUrl("NEXT_PUBLIC_OPERIX_INVOICE_DEMO_URL", "https://demo.invoice.operixsuite.com"),
    demoNote: "Public Invoice demo uses fictional sample data and browser-local changes. No live messages or payments are delivered.",
    featureGroups: [
      { title: "Documents", items: ["Invoices", "Quotes", "Proforma invoices", "Delivery notes", "Orders"] },
      { title: "Finance", items: ["Customers", "Products and services", "Payments", "Expenses", "Reports"] },
      { title: "Operations", items: ["Inventory", "POS", "Accounting-related workflows", "Mobile access"] },
    ],
  },
  hr: {
    key: "hr",
    name: "OperiX HR",
    shortName: "HR",
    description: "People and workforce management from onboarding through payroll.",
    navigationDescription: "People and workforce management",
    marketingPath: "/products/hr",
    applicationUrl: publicUrl("NEXT_PUBLIC_OPERIX_HR_URL", "https://hr.operixsuite.com"),
    icon: Users,
    accent: "#8f63d9",
    hasWeb: true,
    hasMobile: true,
    status: "available",
    demoEnabled: false,
    demoNote: "The HR product is available for authenticated workspaces; a public isolated demo environment is being prepared.",
    featureGroups: [
      { title: "People", items: ["Employees", "Documents", "Recruitment", "Onboarding", "Offboarding"] },
      { title: "Time and pay", items: ["Attendance", "Leave", "Payroll", "Performance", "Reports"] },
    ],
  },
  booking: {
    key: "booking",
    name: "OperiX Booking",
    shortName: "Booking",
    description: "Bookings and reservations with availability, customers, and calendar workflows in one place.",
    navigationDescription: "Bookings and reservations",
    marketingPath: "/products/booking",
    applicationUrl: publicUrl("NEXT_PUBLIC_OPERIX_BOOKING_URL", "https://booking.operixsuite.com"),
    icon: CalendarDays,
    accent: "#3478e5",
    hasWeb: true,
    hasMobile: true,
    status: "available",
    demoEnabled: false,
    demoNote: "The Booking product is available for authenticated workspaces; a public isolated demo environment is being prepared.",
    featureGroups: [
      { title: "Reservations", items: ["Bookings", "Calendar", "Availability", "Reminders", "Payments"] },
      { title: "Resources", items: ["Customers", "Services", "Staff", "Resources", "Locations", "Reports"] },
    ],
  },
  desk: {
    key: "desk",
    name: "OperiX Desk",
    shortName: "Desk",
    description: "Workplace and desk management for offices, floors, and hybrid teams.",
    navigationDescription: "Workplace and desk management",
    marketingPath: "/products/desk",
    applicationUrl: publicUrl("NEXT_PUBLIC_OPERIX_DESK_URL", "https://desk.operixsuite.com"),
    icon: Armchair,
    accent: "#d77b32",
    hasWeb: true,
    hasMobile: true,
    status: "available",
    demoEnabled: false,
    demoNote: "The Desk application is available for authenticated workspaces; a public isolated demo environment is being prepared.",
    featureGroups: [
      { title: "Workplace", items: ["Desk reservations", "Workplace reservations", "Offices", "Floors", "Floor plans"] },
      { title: "Teams", items: ["Desks and resources", "Team presence", "Reservation management", "Workplace analytics", "Mobile access"] },
    ],
  },
};

export const productOrder: ProductKey[] = ["invoice", "hr", "booking", "desk", "control", "suite"];
export const products = productOrder.map((key) => productRegistry[key]);
export const operationalProducts = productOrder.slice(0, 4).map((key) => productRegistry[key]);

export const appLauncherItems = [productRegistry.suite, ...productOrder.filter((key) => key !== "suite").map((key) => productRegistry[key])];

export const signInUrl = authUrl;
export const getStartedUrl = publicUrl("NEXT_PUBLIC_OPERIX_GET_STARTED_URL", "https://invoice.operixsuite.com/signup");
export const helpCenterUrl = "https://helpdesk.operixsuite.com";

export const solutionRegistry = [
  {
    key: "finance",
    name: "Finance",
    path: "/solutions/finance",
    description: "Keep invoices, payments, expenses, inventory, and reports in one focused finance workflow.",
    products: ["invoice"] as ProductKey[],
    icon: ReceiptText,
  },
  {
    key: "people",
    name: "People",
    path: "/solutions/people",
    description: "Bring employee operations and access management together around the people in your organization.",
    products: ["hr", "control"] as ProductKey[],
    icon: Users,
  },
  {
    key: "bookings",
    name: "Bookings",
    path: "/solutions/bookings",
    description: "Manage reservations, availability, customers, services, payments, and reminders in one place.",
    products: ["booking"] as ProductKey[],
    icon: CalendarCheck2,
  },
  {
    key: "workplace",
    name: "Workplace",
    path: "/solutions/workplace",
    description: "Give teams a clear way to plan office days, reserve desks, and understand workspace use.",
    products: ["desk", "hr"] as ProductKey[],
    icon: Armchair,
  },
  {
    key: "small-business",
    name: "Small business",
    path: "/solutions/small-business",
    description: "Start with the OperiX applications that solve today’s work and add more as the organization grows.",
    products: ["invoice", "hr", "booking", "desk"] as ProductKey[],
    icon: Grid2X2,
  },
];

export function getProduct(key: ProductKey): ProductDefinition;
export function getProduct(key: string): ProductDefinition | undefined;
export function getProduct(key: string) {
  return productRegistry[key as ProductKey];
}
