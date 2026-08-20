import Link from "next/link";
import type { Locale } from "../content/types";
import { apiPath, docsPath, supportPath, whatsNewPath } from "../lib/paths";
import { LanguageSwitcher } from "./language-switcher";
import { MobileSiteNav } from "./mobile-site-nav";
import { SearchDialog } from "./search-dialog";
import { HelpCenterLogo } from "./product-logo";

export function DocsHeader({ locale }: { locale: Locale }) {
  const links = [
    { label: locale === "sq" ? "Dokumentacioni" : "Documentation", href: docsPath(locale) },
    { label: "API", href: apiPath(locale) },
    { label: locale === "sq" ? "Çfarë ka të re" : "What's New", href: whatsNewPath(locale) },
    { label: locale === "sq" ? "Mbështetje" : "Support", href: supportPath(locale) },
  ];
  return (
    <header className="docs-header">
      <div className="site-container header-inner">
        <HelpCenterLogo href={`/${locale}`} className="docs-brand" />
        <nav className="desktop-nav" aria-label="Primary navigation">{links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav>
        <div className="header-actions"><SearchDialog locale={locale} /><LanguageSwitcher locale={locale} /><MobileSiteNav locale={locale} links={links} /></div>
      </div>
    </header>
  );
}
