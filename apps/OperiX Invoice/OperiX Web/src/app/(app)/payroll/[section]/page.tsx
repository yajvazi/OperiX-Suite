import { notFound } from "next/navigation";
import { PayrollView, type PayrollSection } from "@/components/payroll/payroll-view";

const sections = new Set([
  "employees", "compensation", "periods", "runs", "review", "adjustments",
  "approvals", "payslips", "payment-batches", "reconciliation",
  "configuration", "reports", "audit",
]);

export default async function PayrollSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <PayrollView section={section as PayrollSection} />;
}
