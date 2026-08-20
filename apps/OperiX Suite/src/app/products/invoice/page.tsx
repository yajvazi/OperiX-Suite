import type { Metadata } from "next";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX Invoice — Invoicing & Business Finance",
  description: "Create invoices, manage customers, follow payments, and organize everyday financial operations with OperiX Invoice.",
  alternates: { canonical: "/products/invoice" },
  openGraph: { title: "OperiX Invoice — Invoicing & Business Finance", description: "Create invoices and manage day-to-day financial operations from one connected OperiX account." },
};

export default function InvoicePage() {
  return <ProductPage content={{
    product: "invoice",
    headline: "Simple invoicing. Powerful business operations.",
    description: "Create invoices, manage customers, track payments, and run your business finances from anywhere.",
    overview: "Keep the documents and activity behind your finances in one focused workspace.",
    workflow: ["Create invoices, quotes, proforma invoices, delivery notes, and orders", "Keep customers, products, services, and vendors connected", "Track payments, expenses, inventory, POS, and reports", "Use the same OperiX account across web and mobile access"],
    useCases: ["Recurring business invoicing", "Customer and payment follow-up", "Expenses and inventory workflows", "Reports for day-to-day financial visibility"],
    mobileCopy: "Create and review financial work on the web or in the Invoice mobile app using the same OperiX account. Mobile availability is product-specific and does not create a separate account.",
  }} />;
}
