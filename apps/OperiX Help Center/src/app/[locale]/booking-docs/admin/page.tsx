import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "../../../../content/types";
import { isLocale } from "../../../../lib/content";
import { BookingDocsHealth } from "../../../../components/booking-docs-health";

export const metadata: Metadata = { title: "Booking Documentation Health", robots: { index: false, follow: false } };

export default async function BookingDocsAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params;
  if (!isLocale(localeValue)) notFound();
  return <BookingDocsHealth locale={localeValue as Locale} />;
}
