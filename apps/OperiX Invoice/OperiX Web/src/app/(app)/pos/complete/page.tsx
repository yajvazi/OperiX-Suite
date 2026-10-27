import { notFound } from "next/navigation";
import { POS_ENABLED } from "@/lib/features";
import { PosCompleteView } from "@/components/pos-complete-view";

export default function PosCompletePage() {
  if (!POS_ENABLED) notFound();
  return <PosCompleteView />;
}
