import type { Metadata } from "next";
import { BarChart3, CreditCard, FileChartColumn, FileText, PackageOpen, ReceiptText, ScanLine, Users } from "lucide-react";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX Invoice",
  description: "Create invoices, manage expenses and payments, and understand financial performance with OperiX Invoice.",
  alternates: { canonical: "/products/invoice" },
};

export default function InvoicePage() {
  return <ProductPage
    product="OperiX Invoice"
    headline="Financial operations, without the friction."
    description="Create professional invoices, manage customers and vendors, follow payments, and turn daily activity into clear reports."
    variant="invoice"
    overviewTitle="A clearer way to manage business finances"
    overviewText="OperiX Invoice connects the documents, transactions, and relationships behind your financial operation so your team can act with confidence."
    overviewPoints={["Create and manage multiple invoice types", "Track expenses, supplier bills, and payments", "Keep customer, vendor, and product records connected", "Generate reports and ledgers from current data"]}
    featureTitle="Everything around the invoice"
    features={[
      { title: "Professional invoices", description: "Create structured invoices and reusable document templates.", icon: ReceiptText },
      { title: "Expenses", description: "Record business costs and keep expense activity organized.", icon: CreditCard },
      { title: "Payments", description: "Follow customer and vendor payment records.", icon: FileText },
      { title: "Reports", description: "Review financial activity through focused reports and ledgers.", icon: FileChartColumn },
      { title: "Customers", description: "Keep customer information close to each transaction.", icon: Users },
      { title: "Products", description: "Maintain the products and services used across documents.", icon: PackageOpen },
      { title: "Document capture", description: "Support faster data entry with scanning workflows.", icon: ScanLine },
      { title: "Analytics", description: "Understand trends across revenue, expenses, and activity.", icon: BarChart3 },
    ]}
  />;
}
