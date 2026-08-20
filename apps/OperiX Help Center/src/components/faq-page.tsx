import { ArrowRight, HelpCircle } from "lucide-react";
import type { Locale } from "../content/types";
import { faqCategories, getFaqs } from "../content/faqs";
import { copy } from "../content/ui";
import { DocsSidebar } from "./docs-navigation";
import { SupportCta } from "./support-cta";

export function FaqPage({ locale }: { locale: Locale }) {
  const faqs = getFaqs(locale);
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><div className="category-heading"><span className="section-icon"><HelpCircle size={21} /></span><p className="eyebrow">OperiX Help Center</p><h1>{copy(locale, "faq")}</h1><p>Find answers across account, billing, product, security and troubleshooting topics. FAQ entries use the same global search index as documentation articles.</p></div><nav className="faq-category-links" aria-label="FAQ categories">{faqCategories.map((category) => <a href={`#faq-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} key={category}>{category}</a>)}</nav><div className="faq-groups">{faqCategories.map((category) => { const items = faqs.filter((faq) => faq.category.toLowerCase() === category.toLowerCase()); return <section id={`faq-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="faq-group" key={category}><h2>{category}</h2>{items.length ? items.map((faq) => <details key={faq.id}><summary>{faq.question}<ArrowRight size={15} /></summary><p>{faq.answer}</p></details>) : <p className="muted-copy">{copy(locale, "comingSoonDescription")}</p>}</section>; })}</div><SupportCta locale={locale} compact /></main></div></div>;
}
