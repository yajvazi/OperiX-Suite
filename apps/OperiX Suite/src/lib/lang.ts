import type { Metadata } from "next";
import { getCopy, href, type Lang } from "@/content/copy";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://operixsuite.com";

/** Page metadata with canonical and hreflang links for both languages. */
export function pageMetadata(lang: Lang, path: string, title: string, description: string): Metadata {
  return {
    title: path === "/" ? { absolute: title } : title,
    description,
    alternates: { canonical: href(lang, path), languages: { en: `${site}${href("en", path)}`, sq: `${site}${href("sq", path)}`, "x-default": `${site}${href("en", path)}` } },
    openGraph: { title, description, locale: lang === "sq" ? "sq_AL" : "en_US", url: href(lang, path), type: "website", siteName: "OperiX" },
  };
}

export { getCopy };
