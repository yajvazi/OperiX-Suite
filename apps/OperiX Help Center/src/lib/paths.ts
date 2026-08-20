import type { Article, Locale, ProductKey } from "../content/types";

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpdesk.operixsuite.com";

export function localePath(locale: Locale, path = "") {
  const normalized = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/${locale}${normalized}`;
}

export function docsPath(locale: Locale, product?: ProductKey, category?: string, slug?: string) {
  if (!product) return localePath(locale, "/help");
  if (product === "suite" && category === "getting-started") {
    if (slug) return localePath(locale, `/help/getting-started/${slug}`);
    return localePath(locale, "/help/getting-started");
  }
  if (slug && category) return localePath(locale, `/help/${product}/${category}/${slug}`);
  if (category) return localePath(locale, `/help/${product}/${category}`);
  return localePath(locale, `/help/${product}`);
}

export function articlePath(locale: Locale, article: Pick<Article, "product" | "category" | "slug">) {
  return docsPath(locale, article.product, article.category, article.slug);
}

export function apiPath(locale: Locale, slug?: string) {
  return localePath(locale, slug ? `/api/${slug}` : "/api");
}

export function faqPath(locale: Locale) {
  return localePath(locale, "/faq");
}

export function troubleshootingPath(locale: Locale) {
  return localePath(locale, "/troubleshooting");
}

export function whatsNewPath(locale: Locale) {
  return localePath(locale, "/whats-new");
}

export function supportPath(locale: Locale) {
  return localePath(locale, "/support");
}

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}
