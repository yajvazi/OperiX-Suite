import { getPublishedArticles } from "../../../content/articles";
import { categoryLabel } from "../../../content/i18n";
import { productsByKey } from "../../../content/products";
import type { Locale } from "../../../content/types";

/** The OperiX Invoice mobile guides, as the OperiX Invoice mobile app lists them. */
export function GET(request: Request) {
  const lang = new URL(request.url).searchParams.get("lang");
  const locale: Locale = lang === "sq" ? "sq" : "en";
  const product = productsByKey.invoice;
  // Web-only guides are left out; an article counts for mobile when it says so.
  const published = getPublishedArticles(locale, "invoice", undefined, "mobile")
    .filter((article) => article.platform === "mobile" || article.platform === "both" || article.platforms?.includes("mobile"));
  const categories = product.categories
    .filter((category) => published.some((article) => article.category === category.slug))
    .sort((a, b) => a.order - b.order)
    .map((category) => ({ slug: category.slug, name: categoryLabel(locale, category) }));
  return Response.json({
    locale,
    categories,
    articles: published.map((article) => ({
      id: article.id,
      category: article.category,
      slug: article.slug,
      title: article.title,
      description: article.description,
      readingTime: article.readingTime,
      path: `/${locale}/help/invoice/${article.category}/${article.slug}`,
    })),
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
