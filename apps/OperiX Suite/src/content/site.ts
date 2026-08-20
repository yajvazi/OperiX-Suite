import {
  Accessibility,
  BookOpen,
  Cloud,
  FileText,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
  Waypoints,
} from "lucide-react";
import { helpCenterUrl, productRegistry, products, solutionRegistry, type ProductKey } from "./products";

export const navigation = [
  { label: "Products", href: "#products", menu: "products" as const },
  { label: "Solutions", href: "#solutions", menu: "solutions" as const },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources", menu: "resources" as const },
  { label: "Enterprise", href: "/enterprise" },
];

export const productCardCopy: Record<ProductKey, { title: string; body: string }> = {
  invoice: { title: "Run your finances.", body: "Create, send, and track business documents, payments, expenses, and reports." },
  hr: { title: "Manage your people.", body: "Keep employee records, attendance, leave, payroll, and workforce workflows together." },
  booking: { title: "Manage every reservation.", body: "Coordinate bookings, availability, services, staff, customers, and reminders." },
  desk: { title: "Plan your workplace.", body: "Make desks, floors, shared resources, and team presence easier to manage." },
  control: { title: "Control your organization.", body: "Manage users, roles, permissions, security, integrations, and audit activity." },
  suite: { title: "Access everything from one place.", body: "Use one OperiX account and organization context to move between the apps you use." },
};

export const trustItems = [
  { title: "One account", text: "Sign in once and access the apps your organization uses.", icon: Waypoints },
  { title: "Clear access", text: "Connect application access to organization permissions.", icon: ShieldCheck },
  { title: "Web + mobile", text: "Use the products that support work away from the desk.", icon: Smartphone },
  { title: "Help when needed", text: "Find product guidance in the OperiX Help Center.", icon: BookOpen, href: helpCenterUrl },
];

export const platformPrinciples = [
  { title: "Shared account", text: "Sign in once and keep identity consistent across the platform.", icon: Waypoints },
  { title: "Organization context", text: "Work in the organization and application access your account is allowed to use.", icon: Cloud },
  { title: "Connected permissions", text: "Control access centrally while each product keeps its own operational workflows.", icon: LockKeyhole },
  { title: "Consistent navigation", text: "Use the App Launcher to move between Suite, products, and Control.", icon: Accessibility },
];

export const securityItems = [
  { title: "Organization-aware access", text: "Product access is scoped to the organizations and permissions available to the account.", icon: ShieldCheck },
  { title: "Role-based permissions", text: "Give people access appropriate to their responsibilities across the platform.", icon: LockKeyhole },
  { title: "Audit visibility", text: "Control includes audit activity so administrators can understand changes over time.", icon: FileText },
  { title: "Encrypted transport", text: "OperiX services are served over HTTPS in the current production setup.", icon: Cloud },
];

export const integrations = [
  { name: "Secure account and data services", note: "Platform foundation", icon: ShieldCheck },
  { name: "Payments", note: "Available where configured in Invoice", icon: Waypoints },
  { name: "Email and notifications", note: "Product-specific workflows", icon: Mail },
  { name: "Document services", note: "Availability depends on deployment configuration", icon: FileText },
];

export const faqs = [
  {
    question: "What is OperiX?",
    answer: "OperiX is one connected business platform made up of specialized applications for finance, people, bookings, workplaces, and platform administration.",
  },
  {
    question: "What is OperiX Suite?",
    answer: "Suite is the central workspace for accessing the OperiX ecosystem. It provides account access, organization context, an application launcher, and shortcuts into the products your organization uses. It is not another operational business application.",
  },
  {
    question: "What is OperiX Control?",
    answer: "Control is the administration and system management layer for OperiX. It is used for organizations, users, roles, permissions, application access, security, integrations, audit logs, and system settings.",
  },
  {
    question: "Can I use only one OperiX application?",
    answer: "Yes. You can start with the product that solves the work in front of you and add other applications as your organization’s needs grow.",
  },
  {
    question: "Do all applications use the same account?",
    answer: "OperiX is designed around one account and organization context. Authorized users can switch between available applications through the App Launcher.",
  },
  {
    question: "Can I add applications later?",
    answer: "Application access is managed for the organization. Your available products can grow as your rollout expands and the right access is configured.",
  },
  {
    question: "Does OperiX have mobile apps?",
    answer: "Invoice, HR, Booking, and Desk have mobile applications in the current product ecosystem. Control is web-only. Suite is the web workspace for accessing the ecosystem.",
  },
  {
    question: "Can I try OperiX before signing up?",
    answer: "A public OperiX Invoice demo is available today with fictional sample data. Additional product demos are being prepared as isolated environments so they do not touch production organizations.",
  },
  {
    question: "Does the demo use real company data?",
    answer: "No. The public demo uses fictional sample data. It is not connected to real customer organizations, production billing, or live messaging.",
  },
  {
    question: "What happens to demo changes?",
    answer: "Invoice demo changes stay in the demo browser and can be reset. They are not copied into a production workspace. A future shared demo environment will use temporary sessions with expiration and cleanup.",
  },
  {
    question: "Where can I find documentation?",
    answer: `The official Help Center is available at ${helpCenterUrl}. Developer documentation will be linked when a public API reference is ready.`,
  },
];

export const resources = [
  { title: "Help Center", description: "Product help, setup references, and support guidance.", status: "Available", href: helpCenterUrl, icon: BookOpen, external: true },
  { title: "Documentation", description: "Product references for the workflows OperiX supports.", status: "In the Help Center", href: helpCenterUrl, icon: FileText, external: true },
  { title: "Demo safety", description: "How the public demo handles fictional data, temporary changes, and disabled external actions.", status: "Read the notes", href: "/resources#demo-safety", icon: ShieldCheck },
  { title: "Developer Documentation", description: "API and integration references as public documentation becomes available.", status: "Preparing", href: "/resources#developer-documentation", icon: Waypoints },
  { title: "What’s new", description: "Product updates and rollout notes from the OperiX team.", status: "Preparing", href: "/resources#whats-new", icon: Accessibility },
  { title: "System status", description: "A status service will be linked when an official public endpoint is available.", status: "Not published", href: "/resources#system-status", icon: Cloud },
  { title: "Contact support", description: "Use the Help Center for product questions and support workflows.", status: "Available", href: helpCenterUrl, icon: Mail, external: true },
];

export const solutionCards = solutionRegistry.map((solution) => ({
  ...solution,
  products: solution.products.map((key) => productRegistry[key]),
}));

export const pricingPlans = [
  {
    name: "Start with one app",
    description: "Choose the OperiX product that matches the work you need to organize first.",
    price: "Contact us",
    note: "Current pricing is available on request.",
    features: ["One OperiX account", "Organization setup", "Product-specific workflows", "Help Center access"],
  },
  {
    name: "Connected platform",
    description: "Bring more applications into the same organization and account context.",
    price: "Contact us",
    note: "Plan structure and limits depend on the rollout.",
    features: ["Multiple OperiX applications", "Shared organization context", "Central application access", "Product-specific mobile access"],
    featured: true,
  },
  {
    name: "Enterprise",
    description: "Discuss a rollout shaped around your organization, deployment, and support needs.",
    price: "Talk to us",
    note: "Enterprise options are discussed with the OperiX team.",
    features: ["Multi-company conversations", "Advanced access requirements", "Custom integration planning", "Onboarding and support planning"],
  },
];

export const mobileProducts = products.filter((product) => product.hasMobile);
