import type { CategoryDefinition, ProductDefinition, ProductKey } from "./types";

const category = (name: string, order: number, description?: string): CategoryDefinition => ({
  slug: name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  name,
  order,
  description,
});

export const productDefinitions: ProductDefinition[] = [
  {
    key: "invoice",
    name: "OperiX Invoice",
    description: "Invoices, point of sale, expenses, VAT registers, reports and payroll on the web and on your phone.",
    icon: "receipt",
    categories: [
      "Getting Started",
      "Data Storage",
      "Plans & Billing",
      "Web vs Mobile",
      "Dashboard",
      "Customers",
      "Products & Services",
      "Invoices",
      "Quotes",
      "Proforma Invoices",
      "Delivery Notes",
      "Orders",
      "Payments",
      "Expenses",
      "Inventory",
      "POS",
      "Accounting",
      "Reports",
      "Payroll",
      "Taxes",
      "Fiscalization",
      "Documents",
      "Settings",
      "Integrations",
      "Company",
      "Users & Permissions",
      "Notifications",
      "Mobile App",
      "Self-Hosting",
      "Troubleshooting",
      "FAQ",
    ].map((name, index) => category(name, index)),
  },
  {
    key: "booking",
    name: "OperiX Booking",
    description: "Appointments, services, staff and customers in one calendar. Coming soon.",
    icon: "calendar",
    comingSoon: true,
    categories: [
      "Getting Started",
      "Dashboard",
      "Bookings",
      "Calendar",
      "Customers",
      "Services",
      "Staff",
      "Resources",
      "Locations",
      "Availability",
      "Payments",
      "Public Booking Page",
      "Notifications",
      "Reports",
      "Mobile App",
      "Settings",
      "Troubleshooting",
    ].map((name, index) => category(name, index)),
  },
  {
    key: "general",
    name: "OperiX",
    description: "Shared guides for getting started with OperiX.",
    icon: "book-open",
    hidden: true,
    categories: ["Getting Started"].map((name, index) => category(name, index)),
  },
];

/** The products shown in navigation, search and on the home page. */
export const listedProducts = productDefinitions.filter((product) => !product.hidden);

export const productsByKey = Object.fromEntries(productDefinitions.map((product) => [product.key, product])) as Record<ProductKey, ProductDefinition>;

export function getProduct(key: string): ProductDefinition | undefined {
  return productDefinitions.find((product) => product.key === key);
}

export function getCategory(product: ProductDefinition, slug: string) {
  return product.categories.find((item) => item.slug === slug);
}
