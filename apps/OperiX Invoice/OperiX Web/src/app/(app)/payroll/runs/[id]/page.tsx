import { PayrollView } from "@/components/payroll/payroll-view";

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayrollView section="review" runId={id} />;
}
