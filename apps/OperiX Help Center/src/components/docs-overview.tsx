import Link from "next/link";
import { ArrowRight, BookOpen, Code2, HelpCircle, Wrench } from "lucide-react";
import type { Locale, ProductKey } from "../content/types";
import { productDefinitions } from "../content/products";
import { getPublicArticles } from "../lib/content";
import { apiPath, docsPath, faqPath, troubleshootingPath } from "../lib/paths";
import { copy } from "../content/ui";
import { DocsSidebar } from "./docs-navigation";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { SupportCta } from "./support-cta";

export function DocsOverview({ locale }: { locale: Locale }) {
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><div className="docs-overview-heading"><p className="eyebrow">OperiX Help Center</p><h1>Documentation for the whole OperiX Suite</h1><p>Start with shared concepts, then choose a product to explore its guides, categories and future documentation.</p></div><div className="overview-products">{productDefinitions.map((product) => <ProductCard key={product.key} locale={locale} product={product} />)}</div><div className="overview-link-grid"><OverviewLink icon={<BookOpen size={19} />} title={copy(locale, "gettingStarted")} text="Create your account, understand organizations and get oriented." href={docsPath(locale, "suite", "getting-started")} /><OverviewLink icon={<Code2 size={19} />} title="OperiX for Developers" text="Build integrations and automate verified OperiX workflows." href={apiPath(locale)} /><OverviewLink icon={<HelpCircle size={19} />} title={copy(locale, "faq")} text="Find answers to common account and product questions." href={faqPath(locale)} /><OverviewLink icon={<Wrench size={19} />} title={copy(locale, "troubleshooting")} text="Check common problems and solution guides." href={troubleshootingPath(locale)} /></div><SupportCta locale={locale} /></main></div></div>;
}

function OverviewLink({ icon, title, text, href }: { icon: React.ReactNode; title: string; text: string; href: string }) { return <Link className="overview-link" href={href}><span className="overview-link-icon">{icon}</span><span><strong>{title}</strong><small>{text}</small></span><ArrowRight size={16} /></Link>; }

export function ProductOverview({ locale, product }: { locale: Locale; product: ProductKey }) {
  const definition = productDefinitions.find((item) => item.key === product)!;
  const articles = getPublicArticles(locale, product);
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} product={product} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><div className="product-overview-heading"><div className="product-overview-icon"><Icon name={definition.icon} size={25} /></div><div><p className="eyebrow">OperiX documentation</p><h1>{definition.name}</h1><p>{definition.description}</p></div></div><div className="product-search-note"><strong>Search {definition.name} documentation</strong><span>Use the global search to find articles in this product when they are published.</span></div><div className="category-grid">{definition.categories.map((category) => { const categoryArticles = articles.filter((article) => article.category === category.slug); return <Link className="category-card" href={docsPath(locale, product, category.slug)} key={category.slug}><span className="category-card-top"><strong>{category.name}</strong><ArrowRight size={15} /></span><span>{categoryArticles.length ? `${categoryArticles.length} published ${categoryArticles.length === 1 ? "article" : "articles"}` : copy(locale, "comingSoon")}</span></Link>; })}</div><SupportCta locale={locale} compact /></main></div></div>;
}

export function CategoryOverview({ locale, product, category }: { locale: Locale; product: ProductKey; category: string }) {
  const definition = productDefinitions.find((item) => item.key === product)!;
  const categoryDefinition = definition.categories.find((item) => item.slug === category)!;
  const articles = getPublicArticles(locale, product, category);
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} product={product} currentCategory={category} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><nav className="article-breadcrumb" aria-label="Breadcrumb"><Link href={`/${locale}/help`}>Help Center</Link><span>/</span><Link href={docsPath(locale, product)}>{definition.name}</Link><span>/</span><strong>{categoryDefinition.name}</strong></nav><div className="category-heading"><p className="eyebrow">{definition.name}</p><h1>{categoryDefinition.name}</h1><p>{categoryDefinition.description ?? `Guides and documentation for ${categoryDefinition.name.toLowerCase()} in ${definition.name}.`}</p></div>{articles.length ? <div className="category-article-list">{articles.map((article) => <Link href={docsPath(locale, product, category, article.slug)} key={article.id}><span><strong>{article.title}</strong><small>{article.description}</small></span><ArrowRight size={16} /></Link>)}</div> : <div className="coming-soon-large"><BookOpen size={27} /><h2>{copy(locale, "comingSoon")}</h2><p>{copy(locale, "comingSoonDescription")}</p></div>}<SupportCta locale={locale} compact /></main></div></div>;
}
