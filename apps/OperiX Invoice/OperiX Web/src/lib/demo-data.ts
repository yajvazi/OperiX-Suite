import type { InvoiceDraft, InvoiceEditorItem, InvoiceStatus } from "@/lib/models";

export interface DemoClient {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  taxId: string;
}

export interface DemoVendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  city: string;
}

export interface DemoProduct {
  id: string;
  name: string;
  description: string;
  sku: string;
  unitPrice: number;
  taxRate: number;
  unit: string;
  stock: number;
  category: string;
}

export interface DemoInvoice {
  id: string;
  clientId: string;
  status: InvoiceStatus;
  createdAt: string;
  draft: InvoiceDraft;
}

export interface DemoState {
  version: 1;
  clients: DemoClient[];
  vendors: DemoVendor[];
  products: DemoProduct[];
  invoices: DemoInvoice[];
}

const item = (
  id: string,
  productId: string,
  description: string,
  quantity: number,
  unitPrice: number,
  taxRate = 18,
  unit = "pcs",
): InvoiceEditorItem => ({
  id,
  product_id: productId,
  description,
  quantity,
  unit_price: unitPrice,
  tax_rate: taxRate,
  discount: 0,
  unit,
});

export const demoClients: DemoClient[] = [
  { id: "client-1", name: "Alba Construction LLC", email: "finance@albaconstruction.test", phone: "+383 44 210 510", address: "Rr. Garibaldi 21", city: "Prishtina", country: "Kosovo", taxId: "810245671" },
  { id: "client-2", name: "Dardania Market", email: "accounts@dardaniamarket.test", phone: "+383 49 330 220", address: "Bulevardi Bill Clinton 88", city: "Prishtina", country: "Kosovo", taxId: "810392104" },
  { id: "client-3", name: "Northstar Studio", email: "hello@northstar.test", phone: "+355 69 440 1180", address: "Rruga e Kavajës 45", city: "Tirana", country: "Albania", taxId: "L92314012M" },
  { id: "client-4", name: "Besa Logistics", email: "billing@besalogistics.test", phone: "+383 45 610 900", address: "Zona Industriale", city: "Fushë Kosovë", country: "Kosovo", taxId: "810774290" },
  { id: "client-5", name: "Mira Dental Clinic", email: "office@miradental.test", phone: "+383 43 812 400", address: "Rr. Agim Ramadani 12", city: "Prishtina", country: "Kosovo", taxId: "810661200" },
];

export const demoVendors: DemoVendor[] = [
  { id: "vendor-1", name: "TechSupply Europe", email: "orders@techsupply.test", phone: "+49 30 555 0190", category: "Technology", city: "Berlin" },
  { id: "vendor-2", name: "Office Plus", email: "sales@officeplus.test", phone: "+383 38 710 210", category: "Office supplies", city: "Prishtina" },
  { id: "vendor-3", name: "Adria Distribution", email: "trade@adriadistribution.test", phone: "+355 68 220 4100", category: "Wholesale", city: "Durrës" },
  { id: "vendor-4", name: "Kulla Packaging", email: "orders@kullapackaging.test", phone: "+383 44 810 330", category: "Packaging", city: "Prizren" },
];

export const demoProducts: DemoProduct[] = [
  { id: "product-1", name: "Business Consulting", description: "Monthly business advisory service", sku: "SVC-001", unitPrice: 750, taxRate: 18, unit: "month", stock: 999, category: "Services" },
  { id: "product-2", name: "Website Maintenance", description: "Website updates, monitoring and support", sku: "SVC-002", unitPrice: 220, taxRate: 18, unit: "month", stock: 999, category: "Services" },
  { id: "product-3", name: "Laptop Pro 14", description: "14-inch business laptop", sku: "HW-014", unitPrice: 1190, taxRate: 18, unit: "pcs", stock: 14, category: "Technology" },
  { id: "product-4", name: "Wireless Keyboard", description: "Compact wireless keyboard", sku: "HW-021", unitPrice: 68, taxRate: 18, unit: "pcs", stock: 38, category: "Accessories" },
  { id: "product-5", name: "Ergonomic Office Chair", description: "Adjustable ergonomic chair", sku: "OFF-105", unitPrice: 285, taxRate: 18, unit: "pcs", stock: 9, category: "Office" },
  { id: "product-6", name: "A4 Paper Box", description: "Five reams of professional A4 paper", sku: "OFF-014", unitPrice: 26.5, taxRate: 18, unit: "box", stock: 64, category: "Office" },
  { id: "product-7", name: "Brand Identity Package", description: "Complete visual identity design", sku: "DSN-301", unitPrice: 980, taxRate: 18, unit: "project", stock: 999, category: "Design" },
  { id: "product-8", name: "Cloud Backup", description: "Secure managed cloud backup", sku: "CLD-040", unitPrice: 45, taxRate: 18, unit: "month", stock: 999, category: "Software" },
  { id: "product-9", name: "POS Receipt Printer", description: "Thermal receipt printer", sku: "POS-055", unitPrice: 175, taxRate: 18, unit: "pcs", stock: 11, category: "Hardware" },
  { id: "product-10", name: "On-site Installation", description: "Professional equipment installation", sku: "SVC-015", unitPrice: 120, taxRate: 18, unit: "service", stock: 999, category: "Services" },
];

const invoice = (
  id: string,
  number: string,
  clientId: string,
  issueDate: string,
  dueDate: string,
  status: InvoiceStatus,
  items: InvoiceEditorItem[],
): DemoInvoice => ({
  id,
  clientId,
  status,
  createdAt: `${issueDate}T09:00:00.000Z`,
  draft: {
    client_id: clientId,
    invoice_number: number,
    issue_date: issueDate,
    due_date: dueDate,
    payment_method: "bank",
    amount_received: 0,
    notes: "Thank you for your business.",
    status,
    items,
  },
});

export function createDemoState(): DemoState {
  return {
    version: 1,
    clients: demoClients.map((entry) => ({ ...entry })),
    vendors: demoVendors.map((entry) => ({ ...entry })),
    products: demoProducts.map((entry) => ({ ...entry })),
    invoices: [
      invoice("invoice-1", "INV-2026-0042", "client-1", "2026-07-18", "2026-08-01", "sent", [
        item("line-1", "product-1", "Business Consulting", 1, 750),
        item("line-2", "product-8", "Cloud Backup", 3, 45),
      ]),
      invoice("invoice-2", "INV-2026-0041", "client-2", "2026-07-14", "2026-07-28", "paid", [
        item("line-3", "product-3", "Laptop Pro 14", 2, 1190),
        item("line-4", "product-4", "Wireless Keyboard", 2, 68),
      ]),
      invoice("invoice-3", "INV-2026-0040", "client-3", "2026-07-08", "2026-07-22", "overdue", [
        item("line-5", "product-7", "Brand Identity Package", 1, 980),
      ]),
      invoice("invoice-4", "INV-2026-0039", "client-5", "2026-07-03", "2026-07-17", "paid", [
        item("line-6", "product-2", "Website Maintenance", 2, 220),
        item("line-7", "product-10", "On-site Installation", 1, 120),
      ]),
    ],
  };
}
