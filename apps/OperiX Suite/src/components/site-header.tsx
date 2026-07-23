"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { navigation } from "@/content/site";
import { al } from "@/content/locales";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const locale = pathname.startsWith("/al") ? "al" : pathname.startsWith("/en") ? "en" : "";
  const prefix = locale ? `/${locale}` : "";
  const labels = locale === "al" ? [al.nav.overview, al.nav.products, al.nav.features, al.nav.pricing, al.nav.resources, al.nav.about, al.nav.contact] : navigation.map((item) => item.label);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="container nav-inner">
        <Link href="/" className="brand" aria-label="OperiX Suite home" onClick={() => setOpen(false)}>
          <Image className="brand-wordmark" src="/brand/operix-wordmark-blue.svg" width={92} height={31} alt="OperiX" />
          <span>Suite</span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigation.map((item, index) => (
            <Link key={item.label} href={`${prefix}${item.href === "/" ? "" : item.href}`}>
              {labels[index]}
            </Link>
          ))}
        </nav>
        <Link href={`${prefix}/book-demo`} className="button button-small nav-cta">
          {locale === "al" ? al.nav.start : "Get Started"}
        </Link>
        <div className="locale-switcher" aria-label="Language selector"><Link href="/en">EN</Link><span aria-hidden="true">/</span><Link href="/al">AL</Link></div>
        <button
          className="menu-button"
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <div id="mobile-navigation" className={`mobile-panel ${open ? "is-open" : ""}`}>
        <nav aria-label="Mobile navigation">
          {navigation.map((item, index) => (
            <Link key={item.label} href={`${prefix}${item.href === "/" ? "" : item.href}`} onClick={() => setOpen(false)}>
              {labels[index]}
            </Link>
          ))}
          <Link href={`${prefix}/book-demo`} className="button" onClick={() => setOpen(false)}>
            {locale === "al" ? al.nav.start : "Get Started"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
