import type { Article, Locale } from "../content/types";
import { getProduct } from "../content/products";
import { articleSequence, resolveRelatedArticles } from "../lib/content";
import { articlePath, absoluteUrl } from "../lib/paths";
import { copy } from "../content/ui";
import { ArticleContent, ArticleHeader, PreviousNext, RelatedArticles } from "./article-content";
import { ArticleFeedback } from "./article-interactions";
import { ArticleViewTracker } from "./article-view-tracker";
import { DocsSidebar, ArticleToc, MobileDocsNavigation } from "./docs-navigation";
import { Icon } from "./icons";
import { SupportCta } from "./support-cta";

export function ArticlePage({ locale, article, isFallback }: { locale: Locale; article: Article; isFallback: boolean }) {
  const product = getProduct(article.product)!;
  const headings = article.blocks.filter((block): block is Extract<typeof block, { type: "heading" }> => block.type === "heading");
  const sequence = articleSequence(article, locale);
  const currentIndex = sequence.findIndex((item) => item.id === article.id);
  const related = resolveRelatedArticles(article, locale);
  const previous = currentIndex > 0 ? sequence[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? sequence[currentIndex + 1] : undefined;
  return <div className="article-page"><ArticleViewTracker articleId={article.id} /><div className="site-container article-layout-shell"><div className="mobile-article-nav"><MobileDocsNavigation locale={locale} product={article.product} currentCategory={article.category} currentSlug={article.slug} /></div><DocsSidebar locale={locale} product={article.product} currentCategory={article.category} currentSlug={article.slug} /><main id="main-content" className="article-main"><ArticleHeader article={article} productName={product.name} productIcon={<Icon name={product.icon} size={26} />} locale={locale} isFallback={isFallback} /><ArticleContent blocks={article.blocks} /><RelatedArticles articles={related} locale={locale} label={copy(locale, "relatedArticles")} /><ArticleFeedback articleId={article.id} labels={{ question: copy(locale, "wasHelpful"), yes: copy(locale, "yes"), no: copy(locale, "no") }} /><SupportCta locale={locale} compact /><PreviousNext previous={previous} next={next} locale={locale} labels={{ previous: copy(locale, "previous"), next: copy(locale, "next") }} /></main><ArticleToc headings={headings} label={copy(locale, "onThisPage")} /></div><ArticleJsonLd article={article} locale={locale} productName={product.name} /></div>;
}

function ArticleJsonLd({ article, locale, productName }: { article: Article; locale: Locale; productName: string }) {
  const payload = { "@context": "https://schema.org", "@type": "TechArticle", headline: article.title, description: article.description, dateModified: article.lastUpdated, inLanguage: locale, author: { "@type": "Organization", name: "OperiX" }, publisher: { "@type": "Organization", name: "OperiX" }, isPartOf: { "@type": "WebSite", name: "OperiX Help Center", url: absoluteUrl(`/${locale}`) }, about: productName, mainEntityOfPage: absoluteUrl(articlePath(locale, article)) };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }} />;
}
