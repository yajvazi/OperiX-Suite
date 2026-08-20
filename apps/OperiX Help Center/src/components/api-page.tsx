import Link from "next/link";
import { ArrowRight, Code2 } from "lucide-react";
import type { Locale } from "../content/types";
import { apiSections, apiSectionBySlug } from "../content/api-docs";
import { apiPath } from "../lib/paths";
import { DocsSidebar } from "./docs-navigation";
import { Icon } from "./icons";
import { SupportCta } from "./support-cta";

export function ApiHome({ locale }: { locale: Locale }) {
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><div className="developer-heading"><span className="section-icon"><Code2 size={21} /></span><p className="eyebrow">OperiX for Developers</p><h1>Build with OperiX</h1><p>Build integrations and automate your OperiX workflows. The framework is ready for verified API references, examples and webhooks.</p></div><div className="api-hero-note"><strong>Developer documentation is being prepared.</strong><span>Actual endpoints and authentication behavior will be published once the public API contract is available.</span></div><div className="api-card-grid">{apiSections.map((section) => <Link className="api-card" href={apiPath(locale, section.slug)} key={section.slug}><span className="api-card-icon"><Icon name={section.icon} size={19} /></span><span><strong>{section.title}</strong><small>{section.description}</small></span><ArrowRight size={16} /></Link>)}</div><SupportCta locale={locale} compact /></main></div></div>;
}

export function ApiSectionPage({ locale, slug }: { locale: Locale; slug: string }) {
  const section = apiSectionBySlug[slug];
  if (!section) return <ApiHome locale={locale} />;
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><nav className="article-breadcrumb" aria-label="Breadcrumb"><Link href={`/${locale}`}>Help Center</Link><span>/</span><Link href={apiPath(locale)}>API</Link><span>/</span><strong>{section.title}</strong></nav><div className="developer-heading compact"><span className="section-icon"><Icon name={section.icon} size={21} /></span><p className="eyebrow">OperiX for Developers</p><h1>{section.title}</h1><p>{section.description}</p></div><div className="api-coming-soon"><span className="api-method">READY FOR CONTENT</span><h2>{section.title} documentation coming later</h2><p>This page is a production-ready template for verified developer documentation. Add request parameters, authenticated code examples, response shapes and error guidance here when the API is available.</p><div className="api-template-grid"><div><strong>Reference layout</strong><span>Endpoint, description, parameters and responses.</span></div><div><strong>Language tabs</strong><span>cURL, JavaScript, TypeScript and Python.</span></div><div><strong>Security</strong><span>Use placeholders only; never publish real credentials.</span></div></div></div><SupportCta locale={locale} compact /></main></div></div>;
}
