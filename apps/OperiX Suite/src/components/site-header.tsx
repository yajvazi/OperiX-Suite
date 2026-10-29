"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getCopy, href, urls } from "@/content/copy";
import { useLang } from "./use-lang";
import { Logo } from "./logo";

export function SiteHeader() {
  const { lang, path } = useLang();
  const t = getCopy(lang);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const links = [
    { label: t.nav.invoice, to: "/invoice" },
    { label: t.nav.booking, to: "/booking", soon: true },
    { label: t.nav.pricing, to: "/pricing" },
    { label: t.nav.contact, to: "/contact" },
  ];
  const other = lang === "en" ? "sq" : "en";

  return <>
  <header className={`site-header ${scrolled || open ? "is-solid" : ""} ${open ? "is-open" : ""}`.trim()}>
    <div className="container header-row">
      <Logo lang={lang} />
      <nav className="header-nav" aria-label="Main">
        {links.map((item) => <Link key={item.to} href={href(lang, item.to)} className={path === item.to ? "is-current" : undefined} aria-current={path === item.to ? "page" : undefined}>{item.label}{item.soon ? <span className="pill pill-soon">{t.comingSoon}</span> : null}</Link>)}
      </nav>
      <div className="header-actions">
        <Link className="lang-switch" href={href(other, path)} hrefLang={other} lang={other} aria-label={t.nav.language}>{other === "sq" ? "SQ" : "EN"}</Link>
        <a className="header-link" href={urls.signIn}>{t.nav.signIn}</a>
        <a className="button button-sm" href={urls.signup}>{t.nav.start}</a>
        <button type="button" className="menu-toggle" aria-label={t.nav.menu} aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
    </div>
  </header>
  {open ? <div className="mobile-panel">
      <nav aria-label="Mobile">
        {links.map((item) => <Link key={item.to} href={href(lang, item.to)} onClick={() => setOpen(false)}>{item.label}{item.soon ? <span className="pill pill-soon">{t.comingSoon}</span> : null}</Link>)}
      </nav>
      <div className="mobile-panel-actions">
        <a className="button" href={urls.signup}>{t.nav.start}</a>
        <a className="button button-secondary" href={urls.signIn}>{t.nav.signIn}</a>
        <Link className="lang-switch lang-switch-wide" href={href(other, path)} hrefLang={other} lang={other} onClick={() => setOpen(false)}>{other === "sq" ? "Shqip" : "English"}</Link>
      </div>
    </div> : null}
  </>;
}
