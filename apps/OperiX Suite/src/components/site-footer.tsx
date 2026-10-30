"use client";

import Link from "next/link";
import { getCopy, href, localUrl, urls } from "@/content/copy";
import { useLang } from "./use-lang";
import { Logo } from "./logo";

export function SiteFooter() {
  const { lang } = useLang();
  const t = getCopy(lang);
  const l = t.footer.links;
  return <footer className="site-footer">
    <div className="container footer-grid">
      <div className="footer-brand">
        <Logo lang={lang} light />
        <p>{t.footer.tagline}</p>
        <a className="button button-light button-sm" href={localUrl(urls.signup, lang)}>{t.nav.start}</a>
      </div>
      <div>
        <h3>{t.footer.product}</h3>
        <ul>
          <li><Link href={href(lang, "/invoice")}>{l.invoice}</Link></li>
          <li><Link href={href(lang, "/booking")}>{l.booking} <span className="pill pill-soon pill-dark">{t.comingSoon}</span></Link></li>
          <li><Link href={href(lang, "/pricing")}>{l.pricing}</Link></li>
        </ul>
      </div>
      <div>
        <h3>{t.footer.company}</h3>
        <ul>
          <li><a href={localUrl(urls.help, lang)}>{l.help}</a></li>
          <li><Link href={href(lang, "/contact")}>{l.contact}</Link></li>
          <li><a href={localUrl(urls.signIn, lang)}>{l.signIn}</a></li>
        </ul>
      </div>
      <div>
        <h3>{t.footer.legal}</h3>
        <ul>
          <li><Link href={href(lang, "/privacy")}>{l.privacy}</Link></li>
          <li><Link href={href(lang, "/terms")}>{l.terms}</Link></li>
        </ul>
      </div>
    </div>
    <div className="container footer-bottom"><span>© {new Date().getFullYear()} OperiX. {t.footer.rights}</span><span>{t.footer.made}</span></div>
  </footer>;
}
