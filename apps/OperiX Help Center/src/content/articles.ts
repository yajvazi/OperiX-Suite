import type { Article, Locale, ProductKey } from "./types";
import { bookingArticles } from "./booking-docs";
import { invoiceCatalogArticles } from "./invoice-catalog.generated";
import { guideArticles } from "./guides";

export function draftsArePreviewable() {
  return process.env.PREVIEW_DRAFTS === "true" && process.env.PREVIEW_AUTHORIZED === "true";
}

function isVisible(article: Article) {
  return !article.draft || draftsArePreviewable();
}

/**
 * The generated Invoice catalog contains placeholder Web articles (generic steps that name source files) and
 * features that were retired or reworded (OperiX AI, trial wording). Those are replaced by hand-written guides, so they are
 * left out of the public Help Center.
 */
const retiredFeatures = new Set(["invoice.subscription", "invoice.ai"]);
const PLACEHOLDER_MARKER = "Audited source entry points";
const articleBase = (id: string) => id.replace(/-(en|sq)$/, "");
const placeholderBases = new Set(
  invoiceCatalogArticles
    .filter((article) => article.blocks.some((block) => (block.type === "list" && block.items.some((item) => item.includes(PLACEHOLDER_MARKER))) || ("text" in block && typeof block.text === "string" && block.text.includes(PLACEHOLDER_MARKER))))
    .map((article) => articleBase(article.id)),
);
const publishedCatalog = invoiceCatalogArticles.filter((article) => !placeholderBases.has(articleBase(article.id)) && !(article.featureId && retiredFeatures.has(article.featureId)));

/** Booking is not launched: its subscription/trial article is hidden until pricing is announced. */
const publishedBooking = bookingArticles.filter((article) => article.featureId !== "booking.subscription" && !/subscription/.test(article.slug));

export const articles: Article[] = [
  ...publishedBooking,
  ...publishedCatalog,
  ...guideArticles,
];

export function getArticle(locale: Locale, product: ProductKey, category: string, slug: string, platform?: "web" | "mobile") {
  const candidates = articles.filter((article) => article.locale === locale && article.product === product && article.category === category && article.slug === slug);
  if (!platform) return candidates.find((article) => article.platform === "both" || !article.platform) ?? candidates[0];
  return candidates.find((article) => article.platform === platform) ?? candidates.find((article) => article.platform === "both" || !article.platform);
}

export function getPublishedArticle(locale: Locale, product: ProductKey, category: string, slug: string, platform?: "web" | "mobile") {
  const exact = getArticle(locale, product, category, slug, platform);
  if (exact && isVisible(exact)) return { article: exact, isFallback: false };
  if (locale !== "en") {
    const fallback = getArticle("en", product, category, slug, platform);
    if (fallback && isVisible(fallback)) return { article: fallback, isFallback: true };
  }
  return { article: undefined, isFallback: false };
}

export function getPublishedArticles(locale: Locale, product?: ProductKey, category?: string, platform?: "web" | "mobile") {
  const localized = articles.filter((article) => article.locale === locale && isVisible(article));
  const matchesPlatform = (article: Article) => !platform || article.platform === platform || article.platform === "both" || !article.platform;
  const filteredLocalized = localized.filter(matchesPlatform);
  const localizedKeys = new Set(filteredLocalized.map((article) => `${article.product}:${article.category}:${article.slug}`));
  const fallback = locale === "en" ? [] : articles.filter((article) => article.locale === "en" && isVisible(article) && matchesPlatform(article) && !localizedKeys.has(`${article.product}:${article.category}:${article.slug}`));
  return [...localized, ...fallback]
    .filter((article) => (product ? article.product === product : true))
    .filter((article) => (category ? article.category === category : true))
    .filter(matchesPlatform)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getArticleById(id: string, locale: Locale = "en") {
  return articles.find((article) => article.locale === locale && article.id === id && isVisible(article))
    ?? articles.find((article) => article.locale === "en" && article.id === id && isVisible(article));
}

export function getArticleDateLabel(article: Article, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "sq" ? "sq-AL" : "en-US", { month: "short", year: "numeric" }).format(new Date(`${article.lastUpdated}T12:00:00Z`));
}
