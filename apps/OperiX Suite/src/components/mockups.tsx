import { Check, Home, FileText, ShoppingCart, Package, Menu, Plus, Search } from "lucide-react";
import type { Lang } from "@/content/copy";

/** A product screenshot inside a simple browser window. */
export function BrowserFrame({ src, alt, priority = false, className = "" }: { src: string; alt: string; priority?: boolean; className?: string }) {
  return <div className={`browser ${className}`.trim()}>
    <div className="browser-bar" aria-hidden="true"><span /><span /><span /><em>invoice.operixsuite.com</em></div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} width={2160} height={1350} loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} />
  </div>;
}

const text = {
  en: { title: "Invoices", sent: "Sent", paid: "Paid", overdue: "Overdue", outstanding: "Outstanding", home: "Home", sales: "Sales", pos: "POS", stock: "Stock", search: "Search invoices", cart: "Current sale", total: "Total", charge: "Charge", item1: "Consulting hour", item2: "Printer paper", item3: "Delivery" },
  sq: { title: "Faturat", sent: "Dërguar", paid: "Paguar", overdue: "Me vonesë", outstanding: "Për t'u arkëtuar", home: "Ballina", sales: "Shitjet", pos: "POS", stock: "Stoku", search: "Kërko fatura", cart: "Shitja aktuale", total: "Totali", charge: "Arkëto", item1: "Orë konsulence", item2: "Letër printeri", item3: "Dërgesë" },
} as const;

/** An illustrative phone screen drawn in HTML, so it stays sharp and follows the page language. */
export function PhoneMock({ lang, variant = "invoices", className = "" }: { lang: Lang; variant?: "invoices" | "pos"; className?: string }) {
  const t = text[lang];
  return <div className={`phone ${className}`.trim()} aria-hidden="true">
    <div className="phone-screen">
      <div className="phone-notch" />
      <div className="phone-inner">
      <div className="phone-top"><Menu size={16} /><strong>{variant === "pos" ? "POS" : t.title}</strong><span className="phone-avatar">O</span></div>
      {variant === "invoices" ? <>
        <div className="phone-search"><Search size={13} />{t.search}</div>
        <div className="phone-stat"><span>{t.outstanding}</span><strong>€3,357.10</strong></div>
        {[["Meridian Works", "€1,044.30", t.sent, "blue"], ["BluePeak Retail", "€2,968.88", t.paid, "green"], ["Orbitline Studio", "€1,156.40", t.overdue, "red"], ["Harborlight Clinic", "€660.80", t.paid, "green"]].map(([name, amount, status, tone]) => <div className="phone-row" key={name}><div><b>{name}</b><small>INV-2026-00{name.length + 20}</small></div><div><b>{amount}</b><i className={`tone-${tone}`}>{status}</i></div></div>)}
      </> : <>
        <div className="phone-cart-title">{t.cart}</div>
        {[[t.item1, "1 × €45.00", "€45.00"], [t.item2, "2 × €4.50", "€9.00"], [t.item3, "1 × €3.00", "€3.00"]].map(([name, qty, amount]) => <div className="phone-row" key={name}><div><b>{name}</b><small>{qty}</small></div><div><b>{amount}</b></div></div>)}
        <div className="phone-total"><span>{t.total}</span><strong>€57.00</strong></div>
        <div className="phone-charge"><Check size={15} /> {t.charge}</div>
      </>}
      </div>
      {variant === "invoices" ? <div className="phone-fab"><Plus size={18} /></div> : null}
      <div className="phone-tabs"><span className="on"><Home size={15} />{t.home}</span><span><FileText size={15} />{t.sales}</span><span><ShoppingCart size={15} />{t.pos}</span><span><Package size={15} />{t.stock}</span></div>
    </div>
  </div>;
}
