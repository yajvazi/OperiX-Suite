import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Cloud,
  CreditCard,
  CalendarDays,
  FileChartColumn,
  FileText,
  Gauge,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";

export const navigation = [
  { label: "Overview", href: "/" },
  { label: "Products", href: "/#products" },
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export const trustItems = [
  { title: "Security", text: "Protected access and secure data.", icon: ShieldCheck },
  { title: "Cloud", text: "Available wherever work happens.", icon: Cloud },
  { title: "Performance", text: "Fast workflows across every device.", icon: Zap },
  { title: "Scalability", text: "Built to grow with your operation.", icon: Gauge },
];

export const products = [
  {
    name: "OperiX Invoice",
    logo: "/brand/operix-xi.svg",
    href: "/products/invoice",
    description:
      "Create invoices, track payments, manage expenses, and understand business performance from one focused workspace.",
    features: ["Professional invoicing", "Payments and expenses", "Reports and ledgers"],
    icon: ReceiptText,
    tone: "blue",
  },
  {
    name: "OperiX HR Office",
    logo: "/brand/operix-xhr.svg",
    href: "/products/hr",
    description:
      "Bring employee records, attendance, leave, payroll, and team operations into one reliable system.",
    features: ["Employee management", "Attendance and leave", "Payroll workflows"],
    icon: Users,
    tone: "navy",
  },
  {
    name: "OperiX Booking",
    logo: "/brand/operix-xb.svg",
    href: "/products/booking",
    description: "Simplify appointments and reservations.",
    details: "An all-in-one appointment and reservation management platform for scheduling services, managing availability, automating confirmations, sending reminders, and enabling seamless online booking.",
    features: ["Appointments and reservations", "Automated confirmations", "Online customer booking"],
    icon: CalendarDays,
    tone: "blue",
    comingSoon: true,
  },
  {
    name: "OperiX Desk",
    logo: "/brand/operix-xd.svg",
    href: "/products/desk",
    description: "Smarter workspace reservations.",
    details: "A flexible workspace booking solution for desks, meeting rooms, offices, and shared spaces—with availability, utilization, and hybrid work in one intuitive platform.",
    features: ["Desk and room booking", "Availability management", "Hybrid-work analytics"],
    icon: Building2,
    tone: "navy",
    comingSoon: true,
  },
  {
    name: "OperiX Control",
    logo: "/brand/operix-xc.svg",
    href: "/products/control",
    description: "One control panel for the entire OperiX Suite.",
    details: "Centralize shared workspace, team, customer, billing, and activity data across every OperiX product.",
    features: ["Unified workspace overview", "Cross-product analytics", "Shared teams and permissions"],
    icon: Gauge,
    tone: "blue",
  },
];

export const benefits = [
  { title: "Automation", text: "Reduce repetitive operational work.", icon: Sparkles },
  { title: "Reports", text: "Turn activity into clear business reports.", icon: FileChartColumn },
  { title: "Analytics", text: "Understand patterns and performance.", icon: BarChart3 },
  { title: "Cloud", text: "Access work from office or on the move.", icon: Cloud },
  { title: "Security", text: "Keep sensitive business data protected.", icon: LockKeyhole },
  { title: "Scalability", text: "Support more people and processes.", icon: Building2 },
  { title: "Real-time sync", text: "Keep teams aligned across devices.", icon: RefreshCw },
  { title: "Employee management", text: "Organize the complete employee lifecycle.", icon: Users },
  { title: "Financial management", text: "Connect invoices, expenses, and payments.", icon: WalletCards },
];

export const featureGroups = [
  {
    title: "Financial operations",
    description: "Everything needed to move from a transaction to a clear financial picture.",
    features: [
      { title: "Invoices", description: "Create, deliver, and manage professional invoices.", icon: FileText },
      { title: "Expenses", description: "Capture costs and understand where money goes.", icon: CreditCard },
      { title: "Payments", description: "Track incoming and outgoing payments.", icon: WalletCards },
      { title: "Reports", description: "Generate ledgers and performance summaries.", icon: FileChartColumn },
    ],
  },
  {
    title: "People operations",
    description: "A shared source of truth for employees, time, and payroll.",
    features: [
      { title: "Employees", description: "Keep employee profiles and documents organized.", icon: Users },
      { title: "Attendance", description: "Track time, schedules, and leave requests.", icon: RefreshCw },
      { title: "Payroll", description: "Prepare payroll records and compliance workflows.", icon: BriefcaseBusiness },
      { title: "Analytics", description: "See workforce activity in a useful context.", icon: BarChart3 },
    ],
  },
];

export const roadmapFeatures = [
  { title: "Inventory", description: "Connected stock and product operations.", icon: Building2 },
  { title: "CRM", description: "A unified view of customer relationships.", icon: Users },
  { title: "AI assistance", description: "Helpful automation across daily workflows.", icon: Sparkles },
];

export const pricingPlans = [
  {
    name: "Starter",
    monthly: "—",
    yearly: "—",
    description: "For small teams establishing their core operations.",
    features: ["Core Invoice or HR workflows", "Essential reporting", "Standard support"],
  },
  {
    name: "Professional",
    monthly: "—",
    yearly: "—",
    description: "For growing companies bringing more workflows together.",
    features: ["Invoice and HR capabilities", "Advanced reports", "Priority support", "Team permissions"],
    featured: true,
  },
  {
    name: "Enterprise",
    monthly: "Custom",
    yearly: "Custom",
    description: "For organizations that need tailored scale and support.",
    features: ["Custom onboarding", "Advanced permissions", "Dedicated support", "Integration planning"],
  },
];

export const faqs = [
  {
    question: "What is OperiX Suite?",
    answer:
      "OperiX Suite brings OperiX Invoice and OperiX HR Office together under one product family, helping teams manage financial and people operations with a consistent experience.",
  },
  {
    question: "Can I start with one product?",
    answer:
      "Yes. You can explore Invoice or HR independently and expand as your business needs change.",
  },
  {
    question: "Does OperiX work on mobile and web?",
    answer:
      "OperiX products are designed for work across web and mobile. Availability can vary by product and deployment.",
  },
  {
    question: "How is pricing handled?",
    answer:
      "Pricing is being finalized. Contact the OperiX team for current availability and a plan matched to your organization.",
  },
  {
    question: "Can I request a guided demo?",
    answer:
      "Yes. Use the Book Demo form and select the product you want to explore.",
  },
];

export const resources = [
  { title: "Documentation", description: "Product setup and workflow references.", status: "Coming soon", icon: FileText },
  { title: "Blog", description: "Ideas for running a clearer operation.", status: "Coming soon", icon: Sparkles },
  { title: "Help Center", description: "Answers for common product questions.", status: "Coming soon", icon: ShieldCheck },
  { title: "Guides", description: "Practical playbooks for finance and people teams.", status: "Coming soon", icon: FileChartColumn },
  { title: "API Documentation", description: "Integration references for technical teams.", status: "Coming soon", icon: RefreshCw },
  { title: "Downloads", description: "Access OperiX products for supported devices.", status: "Coming soon", icon: Cloud },
];
