import { notFound } from "next/navigation";
import { POS_ENABLED } from "@/lib/features";
import { PosCompleteView } from "@/components/pos-complete-view";

export default async function PosCompleteInvoicePage({ params }: { params: Promise<{ invoiceCode: string }> }) {
  if (!POS_ENABLED) notFound();
  const { invoiceCode } = await params;
  return <PosCompleteView invoiceCode={invoiceCode} />;
}
