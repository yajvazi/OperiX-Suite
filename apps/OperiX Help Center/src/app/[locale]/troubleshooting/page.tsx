import type { Locale } from "../../../content/types";
import { isLocale } from "../../../lib/content";
import { TroubleshootingPage } from "../../../components/troubleshooting-page";

export default async function TroubleshootingRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return <TroubleshootingPage locale={locale as Locale} />;
}
