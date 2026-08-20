import type { Locale } from "../../../content/types";
import { isLocale } from "../../../lib/content";
import { SupportPage } from "../../../components/support-page";

export default async function SupportRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return <SupportPage locale={locale as Locale} />;
}
