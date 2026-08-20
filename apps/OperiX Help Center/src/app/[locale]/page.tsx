import type { Metadata } from "next";
import type { Locale } from "../../content/types";
import { isLocale } from "../../lib/content";
import { HomePage } from "../../components/home-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: "How can we help?", description: "Search official OperiX Suite guides, documentation and answers." } : {};
}

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return <HomePage locale={locale as Locale} />;
}
