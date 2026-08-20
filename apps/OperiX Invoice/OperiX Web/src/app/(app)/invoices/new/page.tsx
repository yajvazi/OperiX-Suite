import { InvoiceEditor } from "@/components/invoice-editor";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }){
  await searchParams;
  return <InvoiceEditor />;
}
