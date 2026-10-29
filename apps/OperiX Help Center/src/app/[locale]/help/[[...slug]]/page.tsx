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
type BookingPlatform = "web" | "mobile";

type ResolvedHelp =
  | { type: "overview" }
  | { type: "product"; product: ProductKey; platform?: BookingPlatform }
  | { type: "category"; product: ProductKey; category: string; platform?: BookingPlatform }
  | { type: "article"; product: ProductKey; category: string; articleSlug: string; platform?: BookingPlatform };

function resolveHelp(slug: string[] | undefined): ResolvedHelp | null {
  const parts = slug ?? [];
  if (!parts.length) return { type: "overview" as const };
  if (parts[0] === "getting-started") {
    if (parts.length === 1) return { type: "category" as const, product: "general" as ProductKey, category: "getting-started" };
    return { type: "article" as const, product: "general" as ProductKey, category: "getting-started", articleSlug: parts[1] };
  }
  const product = productDefinitions.find((item) => item.key === parts[0]);
  if (!product) return null;
  const platform = product.key === "booking" && (parts[1] === "web" || parts[1] === "mobile") ? parts[1] : undefined;
  const offset = platform ? 1 : 0;
  if (parts.length === 1) return { type: "product" as const, product: product.key };
  if (platform && parts.length === 2) return { type: "product" as const, product: product.key, platform };
  const category = product.categories.find((item) => item.slug === parts[1 + offset]);
  if (!category) return null;
  if (parts.length === 2 + offset) return { type: "category" as const, product: product.key, category: category.slug, platform };
  return { type: "article" as const, product: product.key, category: category.slug, articleSlug: parts[3] ?? parts[2], platform };
}

function getResolvedProduct(resolved: ReturnType<typeof resolveHelp>) {
  if (!resolved || resolved.type === "overview") return undefined;
  return productDefinitions.find((item) => item.key === resolved.product);
}

export function generateStaticParams() {
  const params: Array<HelpParams> = [];
  for (const locale of ["en", "sq"]) {
    params.push({ locale, slug: [] });
    params.push({ locale, slug: ["getting-started"] });
    for (const product of productDefinitions.filter((item) => !item.hidden)) {
      params.push({ locale, slug: [product.key] });
      for (const category of product.categories) {
        params.push({ locale, slug: [product.key, category.slug] });
      }
      if (product.key === "booking") {
        for (const platform of ["web", "mobile"] as const) {
          params.push({ locale, slug: [product.key, platform] });
          for (const category of product.categories) params.push({ locale, slug: [product.key, platform, category.slug] });
        }
      }
    }
    for (const article of articles.filter((item) => item.locale === locale && (!item.draft || draftsArePreviewable()))) {
      const platformSegments = article.product === "booking" && article.platform === "both" ? ["web", "mobile"] as const : article.product === "booking" && (article.platform === "web" || article.platform === "mobile") ? [article.platform] as const : [undefined];
      for (const platformSegment of platformSegments) params.push({ locale, slug: article.product === "general" && article.category === "getting-started" ? ["getting-started", article.slug] : [article.product, ...(platformSegment ? [platformSegment] : []), article.category, article.slug] });
    }
  }
  return params;
}

export async function generateMetadata({ params }: { params: Promise<HelpParams> }): Promise<Metadata> {
  const { locale: localeValue, slug } = await params;
  if (!isLocale(localeValue)) return {};
  const resolved = resolveHelp(slug);
  if (!resolved) return {};
  const product = getResolvedProduct(resolved);
  if (resolved.type === "article") {
    const result = getPublishedArticle(localeValue as Locale, resolved.product, resolved.category, resolved.articleSlug, resolved.platform);
    if (result.article) {
      const canonicalPath = docsPath(localeValue as Locale, result.article.product, result.article.category, result.article.slug, resolved.platform);
      const equivalentPath = (targetLocale: Locale) => docsPath(targetLocale, result.article!.product, result.article!.category, result.article!.slug, resolved.platform);
      return { title: result.article.title, description: result.article.description, alternates: { canonical: absoluteUrl(canonicalPath), languages: { en: absoluteUrl(equivalentPath("en")), sq: absoluteUrl(equivalentPath("sq")) } }, openGraph: { title: result.article.title, description: result.article.description, url: absoluteUrl(canonicalPath), type: "article", siteName: "OperiX Help Center" } };
    }
  }
  return { title: resolved.type === "overview" ? "Documentation" : resolved.type === "product" ? productDefinitions.find((item) => item.key === resolved.product)?.name : "Documentation" };
}

export default async function HelpRoute({ params }: { params: Promise<HelpParams> }) {
  const { locale: localeValue, slug } = await params;
  if (!isLocale(localeValue)) notFound();
  const locale = localeValue as Locale;
  const resolved = resolveHelp(slug);
  if (!resolved) notFound();
  const product = getResolvedProduct(resolved);
  if (resolved.type === "overview") return <DocsOverview locale={locale} />;
  if (resolved.type === "product") return <ProductOverview locale={locale} product={resolved.product} platform={resolved.platform} />;
  if (resolved.type === "category") return <CategoryOverview locale={locale} product={resolved.product} category={resolved.category} platform={resolved.platform} />;
  const result = getPublishedArticle(locale, resolved.product, resolved.category, resolved.articleSlug, resolved.platform);
  if (!result.article) notFound();
  return <ArticlePage locale={locale} article={result.article} isFallback={result.isFallback} displayPlatform={resolved.platform} />;
}
