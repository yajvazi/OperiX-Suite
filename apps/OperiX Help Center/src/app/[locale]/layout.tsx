import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import type { Locale } from "../../content/types";
import { isLocale } from "../../lib/content";
import { localeMetadata } from "../../lib/metadata";
import { DocsFooter } from "../../components/site-footer";
import { DocsHeader } from "../../components/site-header";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "sq" }];
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return isLocale(locale) ? localeMetadata(locale) : {};
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <><DocsHeader locale={locale as Locale} />{children}<DocsFooter locale={locale as Locale} /></>;
}
