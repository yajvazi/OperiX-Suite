import { redirect } from "next/navigation";
import { InvoiceEditor } from "@/components/invoice-editor";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }){
  const params = await searchParams;
  if (params.edit) return <InvoiceEditor />;
  redirect("/pos");
}
