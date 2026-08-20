"use client";

import Link from "next/link";
import { Menu, X, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { Locale } from "../content/types";
import type { NavigationGroup } from "./docs-navigation";

export function MobileDocsNavRuntime({ groups, productName }: { locale: Locale; groups: NavigationGroup[]; productName: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    document.body.classList.add("docs-nav-is-open");
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.classList.remove("docs-nav-is-open"); };
  }, [open]);
  return <>
    <button type="button" className="mobile-docs-trigger" onClick={() => setOpen(true)} aria-expanded={open}><Menu size={17} /> Documentation</button>
    {open ? <div className="mobile-docs-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><aside className="mobile-docs-drawer" aria-label="Documentation navigation" aria-modal="true" role="dialog">
      <div className="mobile-drawer-heading"><div><small>Documentation</small><strong>{productName}</strong></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close documentation navigation"><X size={19} /></button></div>
      <nav>{groups.map((group) => <div className="mobile-nav-group" key={group.href}><Link className={group.active ? "is-active" : ""} href={group.href} onClick={() => setOpen(false)}><span>{group.label}</span><ChevronRight size={14} /></Link>{group.children?.length ? <div>{group.children.map((child) => <Link className={child.active ? "is-active" : ""} href={child.href} onClick={() => setOpen(false)} key={child.href}>{child.label}</Link>)}</div> : null}</div>)}</nav>
    </aside></div> : null}
  </>;
}
