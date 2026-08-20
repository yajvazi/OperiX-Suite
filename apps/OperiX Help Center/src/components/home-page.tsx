import Link from "next/link";
import { ArrowRight, BookOpen, Code2, HelpCircle, Wrench } from "lucide-react";
import type { Locale, ProductKey } from "../content/types";
import { getFaqs } from "../content/faqs";
import { productDefinitions } from "../content/products";
import { getPublicArticles } from "../lib/content";
import { apiPath, docsPath, faqPath, troubleshootingPath, whatsNewPath } from "../lib/paths";
import { copy } from "../content/ui";
import { HeroSearch } from "./hero-search";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { SupportCta } from "./support-cta";

const popularLinks = [
  { label: "Getting Started", href: (locale: Locale) => docsPath(locale, "suite", "getting-started") },
  { label: "Creating an Invoice", href: (locale: Locale) => docsPath(locale, "invoice", "invoices", "create-invoice") },
  { label: "Managing Employees", href: (locale: Locale) => docsPath(locale, "hr", "employees") },
  { label: "Creating a Booking", href: (locale: Locale) => docsPath(locale, "booking", "bookings") },
  { label: "Reserving a Desk", href: (locale: Locale) => docsPath(locale, "desk", "reserving-a-desk") },
  { label: "Managing Your OperiX Account", href: (locale: Locale) => docsPath(locale, "suite", "operix-account") },
];

const homepageProductKeys: ProductKey[] = ["invoice", "hr", "booking", "desk", "control", "suite"];

export function HomePage({ locale }: { locale: Locale }) {
  const featured = getPublicArticles(locale).filter((article) => article.featured).slice(0, 5);
  const gettingStarted = getPublicArticles(locale, "suite", "getting-started").slice(0, 4);
  const faqs = getFaqs(locale).slice(0, 4);
  const t = (key: string) => copy(locale, key);
  return <>
    <main id="main-content">
      <section className="home-hero"><div className="site-container hero-inner"><h1>{t("howCanWeHelp")}</h1><p>{t("heroDescription")}</p><HeroSearch locale={locale} placeholder={t("searchDocumentation")} /><div className="popular-links"><strong>{t("popular")}</strong>{popularLinks.map((link) => <Link href={link.href(locale)} key={link.label}>{link.label}</Link>)}</div></div></section>

      <section className="home-section browse-section"><div className="site-container"><SectionTitle title={t("browseByProduct")} /><div className="product-grid">{homepageProductKeys.map((key) => { const product = productDefinitions.find((item) => item.key === key)!; return <ProductCard key={product.key} product={product} locale={locale} />; })}</div></div></section>

      <section className="home-section compact-section"><div className="site-container discovery-grid">
        <div className="discovery-panel"><PanelHeading icon={<BookOpen size={18} />} title={t("gettingStarted")} href={docsPath(locale, "suite", "getting-started")} />{gettingStarted.length ? <div className="panel-list">{gettingStarted.map((article) => <Link key={article.id} href={docsPath(locale, article.product, article.category, article.slug)}>{article.title}<ArrowRight size={14} /></Link>)}</div> : <ComingSoon locale={locale} />}</div>
        <div className="discovery-panel"><PanelHeading icon={<Icon name="sparkles" size={18} />} title={t("popularGuides")} href={docsPath(locale)} />{featured.length ? <div className="panel-list">{featured.slice(0, 4).map((article) => <Link key={article.id} href={docsPath(locale, article.product, article.category, article.slug)}>{article.title}<ArrowRight size={14} /></Link>)}</div> : <ComingSoon locale={locale} />}</div>
        <div className="discovery-panel"><PanelHeading icon={<HelpCircle size={18} />} title={t("faq")} href={faqPath(locale)} /><div className="faq-preview">{faqs.map((faq) => <details key={faq.id}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div></div>
        <div className="discovery-panel"><PanelHeading icon={<Code2 size={18} />} title={t("developers")} href={apiPath(locale)} /><div className="panel-list"><Link href={apiPath(locale, "getting-started")}>Getting Started <ArrowRight size={14} /></Link><Link href={apiPath(locale, "authentication")}>Authentication <ArrowRight size={14} /></Link><Link href={apiPath(locale, "webhooks")}>Webhooks <ArrowRight size={14} /></Link><Link href={apiPath(locale, "errors")}>Errors <ArrowRight size={14} /></Link></div></div>
      </div></section>

      <section className="home-section lower-section"><div className="site-container lower-grid"><Link className="feature-panel" href={troubleshootingPath(locale)}><span className="feature-panel-icon"><Wrench size={21} /></span><span><strong>{t("troubleshooting")}</strong><small>Find solutions to common issues and learn what to check next.</small><span className="feature-link">View troubleshooting guides <ArrowRight size={14} /></span></span></Link><Link className="feature-panel" href={whatsNewPath(locale)}><span className="feature-panel-icon"><Icon name="megaphone" size={21} /></span><span><strong>{t("whatsNew")}</strong><small>{t("whatsNewDescription")}</small><span className="feature-link">View latest updates <ArrowRight size={14} /></span></span></Link><SupportCta locale={locale} /></div></section>
    </main>
  </>;
}

function SectionTitle({ title }: { title: string }) { return <div className="section-title"><h2>{title}</h2><span /></div>; }
function PanelHeading({ icon, title, href }: { icon: React.ReactNode; title: string; href: string }) { return <div className="panel-heading"><span className="panel-heading-icon">{icon}</span><h2>{title}</h2><Link href={href} aria-label={`View ${title}`}>View all</Link></div>; }
function ComingSoon({ locale }: { locale: Locale }) { return <div className="coming-soon"><strong>{copy(locale, "comingSoon")}</strong><span>{copy(locale, "comingSoonDescription")}</span></div>; }
