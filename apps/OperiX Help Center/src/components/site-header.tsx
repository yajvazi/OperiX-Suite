import Link from "next/link";
import type { Locale } from "../content/types";
import { copy } from "../content/ui";
import { apiPath, docsPath, supportPath, whatsNewPath } from "../lib/paths";
import { LanguageSwitcher } from "./language-switcher";
import { MobileSiteNav } from "./mobile-site-nav";
import { SearchDialog } from "./search-dialog";
import { HelpCenterLogo } from "./product-logo";

const appUrl = process.env.NEXT_PUBLIC_OPERIX_INVOICE_URL ?? "https://invoice.operixsuite.com";

export function DocsHeader({ locale }: { locale: Locale }) {
  const links = [
    { label: copy(locale, "documentation"), href: docsPath(locale) },
    { label: "API", href: apiPath(locale) },
    { label: copy(locale, "whatsNew"), href: whatsNewPath(locale) },
    { label: copy(locale, "support"), href: supportPath(locale) },
  ];
  return (
    <header className="docs-header">
      <div className="site-container header-inner">
        <HelpCenterLogo href={`/${locale}`} className="docs-brand" />
        <nav className="desktop-nav" aria-label={copy(locale, "primaryNavigation")}>{links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav>
        <div className="header-actions">
          <SearchDialog locale={locale} />
          <LanguageSwitcher locale={locale} />
          <a className="button-primary header-cta" href={appUrl}>{copy(locale, "openApp")}</a>
          <MobileSiteNav locale={locale} links={links} />
        </div>
      </div>
    </header>
  );
}
