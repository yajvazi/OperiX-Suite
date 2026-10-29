import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "../../../../content/types";
import { isLocale } from "../../../../lib/content";
import { InvoiceDocumentationHealth } from "../../../../components/invoice-documentation-health";

export const metadata: Metadata = {
  title: "Invoice documentation health",
  description: "Internal coverage and synchronization dashboard for OperiX Invoice documentation.",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "sq" }];
}

export default async function InvoiceDocumentationHealthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params;
  if (!isLocale(localeValue)) notFound();
  return <InvoiceDocumentationHealth locale={localeValue as Locale} />;
}
