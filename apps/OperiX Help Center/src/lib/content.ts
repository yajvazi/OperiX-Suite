import { articles, getArticleById, getPublishedArticle, getPublishedArticles } from "../content/articles";
import { getCategory, getProduct, productDefinitions } from "../content/products";
import type { Article, Locale, ProductDefinition, ProductKey } from "../content/types";

export function isLocale(value: string): value is Locale {
  return value === "en" || value === "sq";
}

export function getPublicArticles(locale: Locale, product?: ProductKey, category?: string) {
  return getPublishedArticles(locale, product, category);
}

export function getPublicArticle(locale: Locale, product: ProductKey, category: string, slug: string) {
  return getPublishedArticle(locale, product, category, slug);
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
    .map((id) => getArticleById(id, locale))
    .filter((related): related is Article => Boolean(related));
}

export function articleSequence(article: Article, locale: Locale) {
  return getPublicArticles(locale, article.product, article.category);
}

export function getProductArticles(product: ProductKey, locale: Locale) {
  return getPublicArticles(locale, product);
}

export function getAllProducts() {
  return productDefinitions;
}
