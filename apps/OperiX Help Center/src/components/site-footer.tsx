import Link from "next/link";
import type { Locale } from "../content/types";
import { productDefinitions } from "../content/products";
import { apiPath, docsPath, siteUrl, supportPath, whatsNewPath } from "../lib/paths";
import { supportUrl } from "../lib/support";
import { HelpCenterLogo } from "./product-logo";

export function DocsFooter({ locale }: { locale: Locale }) {
  const configuredSupportUrl = supportUrl();
  const contactHref = configuredSupportUrl ?? supportPath(locale);
  return <footer className="docs-footer"><div className="site-container footer-grid">
    <div className="footer-brand"><HelpCenterLogo href={`/${locale}`} className="footer-brand-mark" /><p>OperiX Help Center is the official source for documentation and support knowledge across the OperiX Suite.</p><small>© {new Date().getFullYear()} OperiX. All rights reserved.</small></div>
    <div className="footer-column"><h2>Products</h2>{productDefinitions.map((product) => <Link key={product.key} href={docsPath(locale, product.key)}>{product.name.replace("OperiX ", "")}</Link>)}</div>
    <div className="footer-column"><h2>Resources</h2><Link href={docsPath(locale)}>Documentation</Link><Link href={apiPath(locale)}>API</Link><Link href={whatsNewPath(locale)}>What&apos;s New</Link><Link href={supportPath(locale)}>Support</Link></div>
    <div className="footer-column"><h2>Company</h2><a href={siteUrl} target="_blank" rel="noreferrer">Website</a><a href={`${siteUrl}/privacy`} target="_blank" rel="noreferrer">Privacy</a><a href={`${siteUrl}/terms`} target="_blank" rel="noreferrer">Terms</a><a href={contactHref}>Contact Support</a></div>
  </div></footer>;
}
