import { InvoiceDetail } from "@/components/invoice-detail";

export default async function InvoicePreviewPage({ params }: { params: Promise<{ invoiceNumber: string }> }) {
  const { invoiceNumber } = await params;
  return <InvoiceDetail invoiceNumber={decodeURIComponent(invoiceNumber)} />;
}
