import Link from "next/link";
import { ArrowRight, CheckCircle2, Wrench } from "lucide-react";
import type { Locale } from "../content/types";
import { getPublicArticles } from "../lib/content";
import { copy } from "../content/ui";
import { docsPath } from "../lib/paths";
import { DocsSidebar } from "./docs-navigation";
import { SupportCta } from "./support-cta";

export function TroubleshootingPage({ locale }: { locale: Locale }) {
  const sq = locale === "sq";
  const invoice = getPublicArticles(locale, "invoice", "troubleshooting");
  const checks = sq
    ? ["Rifreskoni faqen ose mbyllni dhe hapni aplikacionin.", "Kontrolloni lidhjen me internet (aplikacioni punon pa internet vetëm në mënyrën «Në këtë pajisje»).", "Sigurohuni që jeni në kompaninë e duhur.", "Provoni një shfletues tjetër ose modalitetin jo-privat.", "Shkarkoni një kopje rezervë përpara se të pastroni të dhënat e shfletuesit."]
    : ["Refresh the page, or close and reopen the app.", "Check your internet connection (the app works offline only in “On this device” mode).", "Make sure you are in the right company.", "Try another browser, or leave private browsing.", "Download a backup before clearing browser data."];
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" />
    <div className="category-heading"><span className="section-icon"><Wrench size={21} /></span><p className="eyebrow">OperiX Help Center</p><h1>{copy(locale, "troubleshooting")}</h1><p>{sq ? "Filloni me këto kontrolle të shpejta, pastaj zgjidhni udhëzimin që përputhet me problemin tuaj." : "Start with these quick checks, then pick the guide that matches your problem."}</p></div>
    <section className="checklist-card"><h2>{sq ? "Provoni së pari" : "Try these first"}</h2><ul>{checks.map((item) => <li key={item}><CheckCircle2 size={18} />{item}</li>)}</ul></section>
    {invoice.length ? <><h2 className="troubleshooting-subhead">OperiX Invoice</h2><div className="troubleshooting-grid">{invoice.map((article) => <Link className="troubleshooting-card" href={docsPath(locale, article.product, article.category, article.slug)} key={article.id}><span className="troubleshooting-icon"><Wrench size={17} /></span><span><strong>{article.title}</strong><small>{article.description}</small></span><ArrowRight size={16} /></Link>)}</div></> : null}
    <SupportCta locale={locale} compact />
  </main></div></div>;
}
