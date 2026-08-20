"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import type { Locale } from "../content/types";
import { LanguageSwitcher } from "./language-switcher";

export function MobileSiteNav({ locale, links }: { locale: Locale; links: Array<{ label: string; href: string }> }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    document.body.classList.add("mobile-nav-is-open");
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.classList.remove("mobile-nav-is-open"); };
  }, [open]);
  const overlay = open ? <div className="mobile-site-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><nav className="mobile-site-panel" aria-label="Mobile navigation">
    <div className="mobile-site-panel-header"><strong>OperiX Help Center</strong><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={19} /></button></div>
    <LanguageSwitcher locale={locale} />
    <div className="mobile-site-links">{links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}</div>
    <Link className="mobile-site-home" href={`/${locale}`} onClick={() => setOpen(false)}>Back to Help Center home</Link>
  </nav></div> : null;
  return <>
    <button type="button" className="mobile-menu-button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}><Menu size={21} /></button>
    {overlay && typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
  </>;
}
