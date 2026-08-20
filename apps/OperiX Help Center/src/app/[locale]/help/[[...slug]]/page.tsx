import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale, ProductKey } from "../../../../content/types";
import { articles, draftsArePreviewable, getPublishedArticle } from "../../../../content/articles";
import { productDefinitions } from "../../../../content/products";
import { isLocale } from "../../../../lib/content";
import { absoluteUrl, docsPath } from "../../../../lib/paths";
import { CategoryOverview, DocsOverview, ProductOverview } from "../../../../components/docs-overview";
import { ArticlePage } from "../../../../components/article-page";

type HelpParams = { locale: string; slug?: string[] };

function resolveHelp(slug: string[] | undefined) {
  const parts = slug ?? [];
  if (!parts.length) return { type: "overview" as const };
  if (parts[0] === "getting-started") {
    if (parts.length === 1) return { type: "category" as const, product: "suite" as ProductKey, category: "getting-started" };
    return { type: "article" as const, product: "suite" as ProductKey, category: "getting-started", articleSlug: parts[1] };
  }
  const product = productDefinitions.find((item) => item.key === parts[0]);
  if (!product) return null;
  if (parts.length === 1) return { type: "product" as const, product: product.key };
  const category = product.categories.find((item) => item.slug === parts[1]);
  if (!category) return null;
  if (parts.length === 2) return { type: "category" as const, product: product.key, category: category.slug };
  return { type: "article" as const, product: product.key, category: category.slug, articleSlug: parts[2] };
}

export function generateStaticParams() {
  const params: Array<HelpParams> = [];
  for (const locale of ["en", "sq"]) {
    params.push({ locale, slug: [] });
    params.push({ locale, slug: ["getting-started"] });
    for (const product of productDefinitions) {
      params.push({ locale, slug: [product.key] });
      for (const category of product.categories) {
        params.push({ locale, slug: [product.key, category.slug] });
      }
    }
    for (const article of articles.filter((item) => item.locale === locale && (!item.draft || draftsArePreviewable()))) {
      params.push({ locale, slug: article.product === "suite" && article.category === "getting-started" ? ["getting-started", article.slug] : [article.product, article.category, article.slug] });
    }
  }
  return params;
}

export async function generateMetadata({ params }: { params: Promise<HelpParams> }): Promise<Metadata> {
  const { locale: localeValue, slug } = await params;
  if (!isLocale(localeValue)) return {};
  const resolved = resolveHelp(slug);
  if (!resolved) return {};
  if (resolved.type === "article") {
    const result = getPublishedArticle(localeValue as Locale, resolved.product, resolved.category, resolved.articleSlug);
    if (result.article) return { title: result.article.title, description: result.article.description, alternates: { canonical: absoluteUrl(docsPath(localeValue as Locale, result.article.product, result.article.category, result.article.slug)) } };
  }
  return { title: resolved.type === "overview" ? "Documentation" : resolved.type === "product" ? productDefinitions.find((item) => item.key === resolved.product)?.name : "Documentation" };
}

export default async function HelpRoute({ params }: { params: Promise<HelpParams> }) {
  const { locale: localeValue, slug } = await params;
  if (!isLocale(localeValue)) notFound();
  const locale = localeValue as Locale;
  const resolved = resolveHelp(slug);
  if (!resolved) notFound();
  if (resolved.type === "overview") return <DocsOverview locale={locale} />;
  if (resolved.type === "product") return <ProductOverview locale={locale} product={resolved.product} />;
  if (resolved.type === "category") return <CategoryOverview locale={locale} product={resolved.product} category={resolved.category} />;
  const result = getPublishedArticle(locale, resolved.product, resolved.category, resolved.articleSlug);
  if (!result.article) notFound();
  return <ArticlePage locale={locale} article={result.article} isFallback={result.isFallback} />;
}
