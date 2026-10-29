import { ArrowRight, HelpCircle } from "lucide-react";
import type { Locale } from "../content/types";
import { faqCategories, getFaqs } from "../content/faqs";
import { copy } from "../content/ui";
import { faqCategoryLabel } from "../content/i18n";
import { DocsSidebar } from "./docs-navigation";
import { SupportCta } from "./support-cta";

export function FaqPage({ locale }: { locale: Locale }) {
  const faqs = getFaqs(locale);
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><div className="category-heading"><span className="section-icon"><HelpCircle size={21} /></span><p className="eyebrow">OperiX Help Center</p><h1>{copy(locale, "faq")}</h1><p>{locale === "sq" ? "Përgjigje të shpejta për llogarinë, faturimin, produktet dhe sigurinë." : "Quick answers about accounts, billing, products and security."}</p></div><nav className="faq-category-links" aria-label={copy(locale, "faqCategories")}>{faqCategories.map((category) => <a href={`#faq-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} key={category}>{faqCategoryLabel(locale, category)}</a>)}</nav><div className="faq-groups">{faqCategories.map((category) => { const items = faqs.filter((faq) => faq.category.toLowerCase() === category.toLowerCase()); return <section id={`faq-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="faq-group" key={category}><h2>{faqCategoryLabel(locale, category)}</h2>{items.length ? items.map((faq) => <details key={faq.id}><summary>{faq.question}<ArrowRight size={15} /></summary><p>{faq.answer}</p></details>) : <p className="muted-copy">{copy(locale, "comingSoonDescription")}</p>}</section>; })}</div><SupportCta locale={locale} compact /></main></div></div>;
}
