import { ControlView } from "@/components/control-views";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ControlView view="users" detailId={id} />;
}
