import Link from "next/link";
import { notFound } from "next/navigation";
import { al, isLocale, type Locale } from "@/content/locales";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const routes = ["", "products/invoice", "products/hr", "features", "pricing", "resources", "about", "contact", "book-demo", "book-demo/success"];

function copy(locale: Locale, slug: string) {
  if (locale === "al") return al;
  return { nav: { overview: "Overview", products: "Products", features: "Features", pricing: "Pricing", resources: "Resources", about: "About", contact: "Contact", start: "Get Started" }, home: { eyebrow: "OPERIX SUITE", title: "One Suite.\nComplete Control.", description: "Bring invoicing, people operations, reporting, and everyday business management into one connected workspace.", productsTitle: "Two powerful products.\nOne clear experience.", productsDescription: "Choose the workspace your business needs today.", benefitsTitle: "Everything You Need to Run Your Business", cta: "Ready to bring your operation into focus?" }, products: { invoice: "OperiX Invoice", hr: "OperiX HR Office", invoiceDescription: "Create invoices, track payments, manage expenses, and understand financial performance.", hrDescription: "Bring employees, attendance, leave, payroll, and team operations together." }, pages: { features: "Features for every team", pricing: "Clear pricing for every stage", resources: "Resources for every step", about: "Business software with clarity", contact: "Let’s talk", demo: "See OperiX around your workflows", success: "Request confirmed" }, actions: { learn: "Learn more", demo: "Book a demo", contact: "Contact us", explore: "Explore products", submit: "Submit request" }, status: "Coming soon" };
}

export default async function LocalizedPage({ params }: { params: Promise<{ locale: string; slug?: string[] }> }) {
  const { locale: rawLocale, slug = [] } = await params;
  if (!isLocale(rawLocale)) notFound();
  const path = slug.join("/");
  if (!routes.includes(path)) notFound();
  const t = copy(rawLocale, path);
  const prefix = `/${rawLocale}`;
  const isInvoice = path === "products/invoice";
  const isHr = path === "products/hr";
  const title = path === "" ? t.home.title : isInvoice ? t.products.invoice : isHr ? t.products.hr : path === "book-demo/success" ? t.pages.success : t.pages[path.split("/")[0] as keyof typeof t.pages] ?? t.home.title;
  const description = path === "" ? t.home.description : isInvoice ? t.products.invoiceDescription : isHr ? t.products.hrDescription : t.home.description;
  return <><SiteHeader /><main>
    <section className="page-hero"><div className="container page-hero-copy"><span className="eyebrow">{path === "" ? t.home.eyebrow : rawLocale === "al" ? "OPERIX" : "OPERIX"}</span><h1>{title.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</h1><p>{description}</p><div className="button-row"><Link className="button" href={`${prefix}/book-demo`}>{t.actions.demo}</Link><Link className="button button-secondary" href={`${prefix}/products/invoice`}>{t.actions.explore}</Link></div></div></section>
    <section className="section"><div className="container"><div className="section-heading centered"><span className="eyebrow">{t.nav.products}</span><h2>{path === "" ? t.home.productsTitle : t.pages.features}</h2><p>{t.home.productsDescription}</p></div><div className="products-grid"><article className="product-card"><div className="product-copy"><h3>{t.products.invoice}</h3><p>{t.products.invoiceDescription}</p><Link className="text-link" href={`${prefix}/products/invoice`}>{t.actions.learn} →</Link></div></article><article className="product-card"><div className="product-copy"><h3>{t.products.hr}</h3><p>{t.products.hrDescription}</p><Link className="text-link" href={`${prefix}/products/hr`}>{t.actions.learn} →</Link></div></article></div></div></section>
    <section className="benefits-section"><div className="container"><div className="section-heading centered"><h2>{t.home.benefitsTitle}</h2><p>{description}</p></div></div></section>
  </main><SiteFooter /></>;
}
