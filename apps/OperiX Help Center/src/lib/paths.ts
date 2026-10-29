import type { Article, Locale, ProductDefinition, ProductKey } from "../content/types";

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpdesk.operixsuite.com";

export function localePath(locale: Locale, path = "") {
  const normalized = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/${locale}${normalized}`;
}

export function docsPath(locale: Locale, product?: ProductKey, category?: string, slug?: string, platform?: "web" | "mobile") {
  if (!product) return localePath(locale, "/help");
  if (product === "general" && category === "getting-started") {
    if (slug) return localePath(locale, `/help/getting-started/${slug}`);
    return localePath(locale, "/help/getting-started");
  }
  const prefix = platform && product === "booking" ? `/help/${product}/${platform}` : `/help/${product}`;
  if (slug && category) return localePath(locale, `${prefix}/${category}/${slug}`);
  if (category) return localePath(locale, `${prefix}/${category}`);
  return localePath(locale, prefix);
}

export function productPath(locale: Locale, product: Pick<ProductDefinition, "key">) {
  return docsPath(locale, product.key);
}

export function articlePath(locale: Locale, article: Pick<Article, "product" | "category" | "slug" | "platform">) {
  const platform = article.platform === "web" || article.platform === "mobile" ? article.platform : undefined;
  return docsPath(locale, article.product, article.category, article.slug, platform);
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
