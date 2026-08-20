import type { Locale } from "../../../content/types";
import { isLocale } from "../../../lib/content";
import { WhatsNewPage } from "../../../components/whats-new-page";

export default async function WhatsNewRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return <WhatsNewPage locale={locale as Locale} />;
}
