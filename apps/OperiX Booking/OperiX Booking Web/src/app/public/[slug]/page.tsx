import { PublicBookingPage } from "@/components/public-booking-page";

export default async function PublicBookingRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicBookingPage slug={slug} />;
}
