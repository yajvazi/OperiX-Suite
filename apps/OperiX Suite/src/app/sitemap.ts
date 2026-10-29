import type { MetadataRoute } from "next";
import { href } from "@/content/copy";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://operixsuite.com";
  const paths = ["/", "/invoice", "/booking", "/pricing", "/contact", "/privacy", "/terms"];
  return paths.flatMap((path) => (["en", "sq"] as const).map((lang) => ({
    url: `${base}${href(lang, path)}`,
    lastModified: new Date(),
    changeFrequency: path === "/" ? "weekly" as const : "monthly" as const,
    priority: path === "/" ? 1 : path === "/invoice" || path === "/pricing" ? 0.9 : 0.6,
    alternates: { languages: { en: `${base}${href("en", path)}`, sq: `${base}${href("sq", path)}` } },
  })));
}
