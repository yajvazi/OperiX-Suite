import { notFound } from "next/navigation";
import { POS_ENABLED } from "@/lib/features";
import { PosView } from "@/components/pos-view";

export default function PosPage() {
  if (!POS_ENABLED) notFound();
  return <PosView />;
}
