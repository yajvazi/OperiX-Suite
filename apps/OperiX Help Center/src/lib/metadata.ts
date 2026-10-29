import type { Metadata } from "next";
import type { Locale } from "../content/types";
import { absoluteUrl, siteUrl } from "./paths";

export const siteName = "OperiX Help Center";
export const defaultDescription = "Official documentation for OperiX Invoice and OperiX Booking: guides, FAQs, API reference and troubleshooting.";

export function localeMetadata(locale: Locale): Metadata {
  return {
    metadataBase: new URL(siteUrl),
    title: { default: siteName, template: `%s · ${siteName}` },
    description: defaultDescription,
    alternates: { canonical: absoluteUrl(`/${locale}`), languages: { en: absoluteUrl("/en"), sq: absoluteUrl("/sq") } },
    openGraph: { type: "website", siteName, title: siteName, description: defaultDescription, url: absoluteUrl(`/${locale}`) },
    twitter: { card: "summary" },
  };
}

