import { BulkExportView } from "@/components/bulk-export-view";

export default async function BulkExportPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return <BulkExportView kind={kind === "expenses" || kind === "payments" ? kind : "invoices"} />;
}
