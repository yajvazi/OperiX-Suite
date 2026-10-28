import { redirect } from "next/navigation";
import { InvoiceEditor } from "@/components/invoice-editor";
import { newDocumentHref, POS_ENABLED } from "@/lib/features";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }){
  const params = await searchParams;
  const existingDocument = Boolean(params.edit || params.convert || params.salesBookAmendment);
  const specialType = Boolean(params.documentType) || (params.type !== undefined && params.type !== "offer");
  // New invoices and quotes are created in the POS; the editor handles everything else.
  if (POS_ENABLED && !existingDocument && !specialType) redirect(newDocumentHref(params.type === "offer" ? "offer" : undefined));
  return <InvoiceEditor />;
}
