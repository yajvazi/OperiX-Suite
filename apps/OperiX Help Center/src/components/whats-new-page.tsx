import { Megaphone } from "lucide-react";
import type { Locale } from "../content/types";
import { releases } from "../content/releases";
import { productDefinitions } from "../content/products";
import { copy } from "../content/ui";
import { DocsSidebar } from "./docs-navigation";
import { SupportCta } from "./support-cta";

export function WhatsNewPage({ locale }: { locale: Locale }) {
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><div className="category-heading"><span className="section-icon"><Megaphone size={21} /></span><p className="eyebrow">OperiX Help Center</p><h1>{copy(locale, "whatsNew")}</h1><p>Release notes and product updates will appear here, with filters by product and release type.</p></div>{releases.length ? <div className="release-list">{releases.map((release) => <article key={release.id}><span>{release.month}</span><h2>{release.title}</h2><p>{release.description}</p></article>)}</div> : <div className="coming-soon-large release-empty"><Megaphone size={27} /><h2>Release notes are on the way</h2><p>When verified product updates are available, they will be organized by month, product, version and release type.</p><div className="release-filter-preview">{productDefinitions.map((product) => <span key={product.key}>{product.name}</span>)}</div></div>}<SupportCta locale={locale} compact /></main></div></div>;
}
