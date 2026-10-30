import { ReportDetailView } from "@/components/report-detail-view";

export default async function ReportDetailPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return <ReportDetailView type={type} />;
}
