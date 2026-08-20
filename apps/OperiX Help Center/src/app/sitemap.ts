import type { MetadataRoute } from "next";
import { apiSections } from "../content/api-docs";
import { productDefinitions } from "../content/products";
import { allPublishedArticles } from "../lib/content";
import { apiPath, articlePath, docsPath, faqPath, troubleshootingPath, whatsNewPath, absoluteUrl } from "../lib/paths";

export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.INDEXING_ALLOWED !== "true") return [];
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of ["en", "sq"] as const) {
    entries.push({ url: absoluteUrl(`/${locale}`), changeFrequency: "weekly", priority: 1 });
    entries.push({ url: absoluteUrl(docsPath(locale)), changeFrequency: "weekly", priority: 0.9 });
    entries.push({ url: absoluteUrl(faqPath(locale)), changeFrequency: "monthly", priority: 0.6 });
    entries.push({ url: absoluteUrl(troubleshootingPath(locale)), changeFrequency: "monthly", priority: 0.6 });
    entries.push({ url: absoluteUrl(whatsNewPath(locale)), changeFrequency: "weekly", priority: 0.6 });
    entries.push({ url: absoluteUrl(apiPath(locale)), changeFrequency: "monthly", priority: 0.6 });
    for (const product of productDefinitions) {
      entries.push({ url: absoluteUrl(docsPath(locale, product.key)), changeFrequency: "weekly", priority: 0.75 });
      for (const category of product.categories) entries.push({ url: absoluteUrl(docsPath(locale, product.key, category.slug)), changeFrequency: "monthly", priority: 0.45 });
    }
    for (const section of apiSections) entries.push({ url: absoluteUrl(apiPath(locale, section.slug)), changeFrequency: "monthly", priority: 0.45 });
    for (const article of allPublishedArticles().filter((item) => item.locale === locale)) entries.push({ url: absoluteUrl(articlePath(locale, article)), lastModified: article.lastUpdated, changeFrequency: "monthly", priority: article.featured ? 0.8 : 0.65 });
  }
  return entries;
}
