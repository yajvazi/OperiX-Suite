import { BookingDetailView } from "@/components/booking-views";

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingDetailView id={id} />;
}
