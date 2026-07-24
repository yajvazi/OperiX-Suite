import { PosCompleteView } from "@/components/pos-complete-view";

export default async function PosCompleteInvoicePage({ params }: { params: Promise<{ invoiceCode: string }> }) {
  const { invoiceCode } = await params;
  return <PosCompleteView invoiceCode={invoiceCode} />;
}
