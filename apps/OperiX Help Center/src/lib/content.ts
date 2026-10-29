import { articles, getArticleById, getPublishedArticle, getPublishedArticles } from "../content/articles";
import { getCategory, getProduct, productDefinitions } from "../content/products";
import type { Article, Locale, ProductDefinition, ProductKey } from "../content/types";

export function isLocale(value: string): value is Locale {
  return value === "en" || value === "sq";
}

export function getPublicArticles(locale: Locale, product?: ProductKey, category?: string, platform?: "web" | "mobile") {
  return getPublishedArticles(locale, product, category, platform);
}

export function getPublicArticle(locale: Locale, product: ProductKey, category: string, slug: string, platform?: "web" | "mobile") {
  return getPublishedArticle(locale, product, category, slug, platform);
}

export function getArticlesByFeatureId(featureId: string, locale: Locale) {
  return articles
    .filter((article) => article.featureId === featureId && article.locale === locale && !article.draft)
    .sort((a, b) => (a.platform ?? "").localeCompare(b.platform ?? ""));
}

export function getProductOrThrow(productKey: string): ProductDefinition {
  const product = getProduct(productKey);
  if (!product) throw new Error(`Unknown product: ${productKey}`);
  return product;
}

export function getCategoryOrThrow(product: ProductDefinition, categorySlug: string) {
  const category = getCategory(product, categorySlug);
  if (!category) throw new Error(`Unknown category: ${product.key}/${categorySlug}`);
  return category;
}

export function allPublishedArticles() {
  return articles.filter((article) => !article.draft);
}

export function resolveRelatedArticles(article: Article, locale: Locale) {
  return (article.related ?? [])
    .map((id) => {
      // Albanian articles are `${id}-sq`; generated catalog articles end in -en/-sq.
      if (locale === "sq") return getArticleById(`${id}-sq`, "sq") ?? getArticleById(id.replace(/-en$/, "-sq"), "sq") ?? getArticleById(id, locale);
      return getArticleById(id, locale);
    })
    .filter((related): related is Article => Boolean(related));
}

export function articleSequence(article: Article, locale: Locale) {
  return getPublicArticles(locale, article.product, article.category, article.platform === "web" || article.platform === "mobile" ? article.platform : undefined);
}

export function getProductArticles(product: ProductKey, locale: Locale) {
  return getPublicArticles(locale, product);
}

export function getAllProducts() {
  return productDefinitions;
}
