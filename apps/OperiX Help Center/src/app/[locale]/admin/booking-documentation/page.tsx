import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "../../../../content/types";
import { isLocale } from "../../../../lib/content";
import { BookingDocsHealth } from "../../../../components/booking-docs-health";

export const metadata: Metadata = {
  title: "Booking documentation health",
  description: "Internal coverage and synchronization dashboard for OperiX Booking documentation.",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "sq" }];
}

export default async function BookingDocumentationHealthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params;
  if (!isLocale(localeValue)) notFound();
  return <BookingDocsHealth locale={localeValue as Locale} />;
}

