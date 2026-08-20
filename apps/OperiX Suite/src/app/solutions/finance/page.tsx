import type { Metadata } from "next";
import { SolutionPage } from "@/components/solution-page";

export const metadata: Metadata = { title: "Finance Solutions — OperiX", description: "Organize invoicing, payments, expenses, inventory, and reports with OperiX Invoice.", alternates: { canonical: "/solutions/finance" } };

export default function FinanceSolutionPage() { return <SolutionPage content={{ name: "Finance", headline: "A clearer way to run the financial work behind your business.", description: "Use OperiX Invoice to create documents, track payments, manage expenses, and keep business finance activity in one focused workflow.", products: ["invoice"], outcomes: ["Create and follow invoices from draft to payment", "Keep customers, products, services, and vendors close to the work", "Track expenses, inventory, POS, and accounting-related activity", "Turn day-to-day transactions into useful reports"], workflow: ["Start with your customers and products", "Create the documents your business uses", "Record payments and expenses", "Review reports and follow-up work"] }} />; }

