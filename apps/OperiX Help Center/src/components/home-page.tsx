import Link from "next/link";
import { ArrowRight, BookOpen, Code2, Database, HelpCircle, Smartphone, Wrench, WalletCards, ChartNoAxesCombined, ServerCog, ShoppingCart } from "lucide-react";
import type { Locale } from "../content/types";
import { getFaqs } from "../content/faqs";
import { listedProducts } from "../content/products";
import { getPublicArticles } from "../lib/content";
import { apiPath, docsPath, faqPath, troubleshootingPath, whatsNewPath } from "../lib/paths";
import { copy } from "../content/ui";
import { HeroSearch } from "./hero-search";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { SupportCta } from "./support-cta";

export function HomePage({ locale }: { locale: Locale }) {
  const sq = locale === "sq";
  const t = (key: string) => copy(locale, key);
  const featured = getPublicArticles(locale).filter((article) => article.featured && article.product !== "booking").slice(0, 6);
  const faqs = getFaqs(locale).slice(0, 5);
  const countFor = (key: string) => getPublicArticles(locale, key as "invoice" | "booking").length;

  const popular = [
    { label: sq ? "Filloni këtu" : "Getting started", href: docsPath(locale, "general", "getting-started") },
    { label: sq ? "Ku ruhen të dhënat" : "Where your data lives", href: docsPath(locale, "invoice", "data-storage") },
    { label: sq ? "Krijoni një faturë" : "Create an invoice", href: docsPath(locale, "invoice", "invoices") },
    { label: sq ? "Kopje rezervë" : "Backups", href: docsPath(locale, "invoice", "data-storage") },
    { label: "API", href: apiPath(locale) },
  ];

  const quick = [
    { icon: <BookOpen size={22} />, title: sq ? "Filloni" : "Get started", text: sq ? "Krijoni llogarinë, zgjidhni ku ruhen të dhënat dhe dërgoni faturën e parë." : "Create your account, choose where your data lives and send your first invoice.", href: docsPath(locale, "invoice", "getting-started") },
    { icon: <Database size={22} />, title: sq ? "Të dhënat dhe kopjet rezervë" : "Data storage & backups", text: sq ? "Në këtë pajisje ose në cloud, kopje rezervë, kthim dhe kopjim." : "On this device or in the cloud: backups, restore and copying between them.", href: docsPath(locale, "invoice", "data-storage") },
    { icon: <WalletCards size={22} />, title: sq ? "Planet dhe faturimi" : "Plans & billing", text: sq ? "Plani falas, OperiX Invoice në cloud dhe shtesat." : "The free plan, OperiX Invoice in the cloud and add-ons.", href: docsPath(locale, "invoice", "plans-and-billing") },
    { icon: <ShoppingCart size={22} />, title: sq ? "Pika e shitjes" : "Point of sale", text: sq ? "Shitje në banak, porosi të mbajtura, barkod dhe stok." : "Sell at the counter, hold orders, scan barcodes and track stock.", href: docsPath(locale, "invoice", "pos") },
    { icon: <ChartNoAxesCombined size={22} />, title: sq ? "Raporte dhe TVSH" : "Reports & VAT", text: sq ? "Libra shitjesh e blerjesh, fitim e humbje, libri i përgjithshëm." : "Sales and purchase registers, profit & loss and the ledger.", href: docsPath(locale, "invoice", "reports") },
    { icon: <Smartphone size={22} />, title: sq ? "Aplikacioni celular" : "Mobile app", text: sq ? "Përdorni OperiX në telefon: fatura, POS, skanim dhe përdorim pa internet." : "Use OperiX on your phone: invoices, POS, scanning and offline use.", href: docsPath(locale, "invoice", "mobile-app") },
    { icon: <ServerCog size={22} />, title: sq ? "Vetë-strehimi" : "Self-hosting", text: sq ? "Ekzekutoni aplikacionin web me kod të hapur në serverin tuaj." : "Run the open-source web app on your own server.", href: docsPath(locale, "invoice", "self-hosting") },
    { icon: <Code2 size={22} />, title: sq ? "API për zhvilluesit" : "API for developers", text: sq ? "Lidhni sistemet tuaja me OperiX Invoice." : "Connect your own systems to OperiX Invoice.", href: apiPath(locale) },
  ];

  return <main id="main-content">
    <section className="home-hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="site-container hero-inner">
        <h1>{t("howCanWeHelp")}</h1>
        <p>{t("heroDescription")}</p>
        <HeroSearch locale={locale} placeholder={t("searchDocumentation")} />
        <div className="popular-links"><strong>{t("popular")}</strong>{popular.map((link) => <Link href={link.href} key={link.label}>{link.label}</Link>)}</div>
      </div>
    </section>

    <section className="home-section">
      <div className="site-container">
        <div className="section-head"><h2>{t("browseByProduct")}</h2></div>
        <div className="product-grid">{listedProducts.map((product) => <ProductCard key={product.key} product={product} locale={locale} articleCount={countFor(product.key)} />)}</div>
      </div>
    </section>

    <section className="home-section tint-section">
      <div className="site-container">
        <div className="section-head"><h2>{t("quickStart")}</h2></div>
        <div className="quick-grid">{quick.map((item) => <Link className="quick-card" href={item.href} key={item.title}><span className="quick-icon">{item.icon}</span><strong>{item.title}</strong><span>{item.text}</span></Link>)}</div>
      </div>
    </section>

    {featured.length ? <section className="home-section">
      <div className="site-container">
        <div className="section-head"><h2>{t("popularGuides")}</h2><Link href={docsPath(locale)}>{t("viewAll")} <ArrowRight size={15} /></Link></div>
        <div className="guide-grid">{featured.map((article) => <Link className="guide-card" key={article.id} href={docsPath(locale, article.product, article.category, article.slug)}><strong>{article.title}</strong><span>{article.description}</span><span className="guide-meta">{article.readingTime} {t("read")}</span></Link>)}</div>
      </div>
    </section> : null}

    <section className="home-section dev-band">
      <div className="site-container dev-inner">
        <div><span className="hero-eyebrow eyebrow-light">API</span><h2>{sq ? "Ndërtoni me OperiX" : "Build with OperiX"}</h2><p>{sq ? "Krijoni klientë, fatura dhe pagesa nga sistemet tuaja me API-n e OperiX Invoice. API-ja e Booking vjen së shpejti." : "Create customers, invoices and payments from your own systems with the OperiX Invoice API. The Booking API is coming soon."}</p><div className="dev-actions"><Link className="button-light" href={apiPath(locale)}>{sq ? "Hapni dokumentacionin e API" : "Open the API docs"}</Link><Link className="button-ghost-light" href={apiPath(locale, "quick-start")}>{sq ? "Filloni shpejt" : "Quick start"}</Link></div></div>
        <pre className="dev-code" aria-hidden="true"><code>{`curl https://api.operixsuite.com/v1/invoice/invoices \\
  -H "Authorization: Bearer opx_test_..." \\
  -H "Idempotency-Key: order-1042"`}</code></pre>
      </div>
    </section>

    <section className="home-section">
      <div className="site-container faq-row">
        <div><div className="section-head"><h2>{t("faq")}</h2><Link href={faqPath(locale)}>{t("viewAll")} <ArrowRight size={15} /></Link></div><div className="faq-preview">{faqs.map((faq) => <details key={faq.id}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div></div>
        <div className="side-links">
          <Link className="feature-panel" href={troubleshootingPath(locale)}><span className="feature-panel-icon"><Wrench size={21} /></span><span><strong>{t("troubleshooting")}</strong><small>{sq ? "Zgjidhje për problemet më të shpeshta." : "Solutions to the most common problems."}</small></span></Link>
          <Link className="feature-panel" href={whatsNewPath(locale)}><span className="feature-panel-icon"><Icon name="megaphone" size={21} /></span><span><strong>{t("whatsNew")}</strong><small>{t("whatsNewDescription")}</small></span></Link>
          <Link className="feature-panel" href={faqPath(locale)}><span className="feature-panel-icon"><HelpCircle size={21} /></span><span><strong>{t("faq")}</strong><small>{sq ? "Përgjigje të shpejta për pyetje të zakonshme." : "Quick answers to common questions."}</small></span></Link>
        </div>
      </div>
    </section>

    <section className="home-section"><div className="site-container"><SupportCta locale={locale} /></div></section>
  </main>;
}
