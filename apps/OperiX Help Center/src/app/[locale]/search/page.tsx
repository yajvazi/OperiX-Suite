import type { Metadata } from "next";
import type { Locale } from "../../../content/types";
import { isLocale } from "../../../lib/content";
import { SearchResultsPage } from "../../../components/search-results";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string | string[] }> }): Promise<Metadata> {
  const { locale } = await params;
  const queryParams = await searchParams;
  const query = Array.isArray(queryParams.q) ? queryParams.q[0] : queryParams.q;
  return isLocale(locale) ? { title: query ? `Search results for ${query}` : "Search documentation", robots: { index: false, follow: true } } : {};
}

export default async function SearchRoute({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const { locale } = await params;
  const queryParams = await searchParams;
  if (!isLocale(locale)) return null;
  const query = Array.isArray(queryParams.q) ? queryParams.q[0] ?? "" : queryParams.q ?? "";
  return <SearchResultsPage locale={locale as Locale} query={query} />;
}
