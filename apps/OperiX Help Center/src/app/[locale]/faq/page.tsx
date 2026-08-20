import type { Locale } from "../../../content/types";
import { isLocale } from "../../../lib/content";
import { FaqPage } from "../../../components/faq-page";

export default async function FaqRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return <FaqPage locale={locale as Locale} />;
}
