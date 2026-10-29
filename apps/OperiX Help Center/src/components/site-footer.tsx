import Link from "next/link";
import type { Locale } from "../content/types";
import { copy } from "../content/ui";
import { listedProducts } from "../content/products";
import { apiPath, docsPath, productPath, siteUrl, supportPath, whatsNewPath } from "../lib/paths";
import { supportUrl } from "../lib/support";
import { HelpCenterLogo } from "./product-logo";

const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://operixsuite.com";

export function DocsFooter({ locale }: { locale: Locale }) {
  const configuredSupportUrl = supportUrl();
  const contactHref = configuredSupportUrl ?? supportPath(locale);
  const sq = locale === "sq";
  return <footer className="docs-footer"><div className="site-container footer-grid">
    <div className="footer-brand"><HelpCenterLogo href={`/${locale}`} className="footer-brand-mark" light /><p>{sq ? "Burimi zyrtar i dokumentacionit dhe i ndihmës për OperiX Invoice dhe OperiX Booking." : "The official source of documentation and help for OperiX Invoice and OperiX Booking."}</p></div>
    <div className="footer-column"><h2>{sq ? "Produktet" : "Products"}</h2>{listedProducts.map((product) => <Link key={product.key} href={productPath(locale, product)}>{product.name}{product.comingSoon ? <span className="soon-pill">{copy(locale, "comingSoonBadge")}</span> : null}</Link>)}</div>
    <div className="footer-column"><h2>{sq ? "Burime" : "Resources"}</h2><Link href={docsPath(locale)}>{copy(locale, "documentation")}</Link><Link href={apiPath(locale)}>API</Link><Link href={whatsNewPath(locale)}>{copy(locale, "whatsNew")}</Link><Link href={supportPath(locale)}>{copy(locale, "support")}</Link></div>
    <div className="footer-column"><h2>{sq ? "Kompania" : "Company"}</h2><a href={marketingUrl} target="_blank" rel="noreferrer">{sq ? "Faqja kryesore" : "Website"}</a><a href={`${marketingUrl}/privacy`} target="_blank" rel="noreferrer">{sq ? "Privatësia" : "Privacy"}</a><a href={`${marketingUrl}/terms`} target="_blank" rel="noreferrer">{sq ? "Kushtet" : "Terms"}</a><a href={contactHref}>{copy(locale, "contactSupport")}</a></div>
  </div><div className="site-container footer-bottom"><span>© {new Date().getFullYear()} OperiX. {sq ? "Të gjitha të drejtat e rezervuara." : "All rights reserved."}</span><a href={siteUrl}>{siteUrl.replace("https://", "")}</a></div></footer>;
}
