import type { Locale } from "../../../../content/types";
import { apiSections } from "../../../../content/api-docs";
import { isLocale } from "../../../../lib/content";
import { ApiHome, ApiSectionPage } from "../../../../components/api-page";

export function generateStaticParams() {
  return ["en", "sq"].flatMap((locale) => [{ locale, slug: [] }, ...apiSections.map((section) => ({ locale, slug: [section.slug] }))]);
}

export default async function ApiRoute({ params }: { params: Promise<{ locale: string; slug?: string[] }> }) {
  const { locale: localeValue, slug } = await params;
  if (!isLocale(localeValue)) return null;
  const locale = localeValue as Locale;
  return slug?.length ? <ApiSectionPage locale={locale} slug={slug[0]} /> : <ApiHome locale={locale} />;
}
