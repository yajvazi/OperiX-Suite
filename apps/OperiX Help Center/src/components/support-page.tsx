import Link from "next/link";
import { BookOpen, Code2, Mail, Wrench } from "lucide-react";
import type { Locale } from "../content/types";
import { copy } from "../content/ui";
import { apiPath, docsPath, troubleshootingPath } from "../lib/paths";
import { supportEmail, supportMailto, supportUrl } from "../lib/support";
import { DocsSidebar } from "./docs-navigation";

export function SupportPage({ locale }: { locale: Locale }) {
  const sq = locale === "sq";
  const configured = supportUrl();
  const primaryHref = configured ?? supportMailto(sq ? "Pyetje për OperiX" : "OperiX question");
  const include = sq
    ? ["Produkti dhe platforma (web ose celular)", "Çfarë po provonit të bënit dhe çfarë ndodhi", "Mesazhi i gabimit, nëse ka", "A ruhen të dhënat «Në këtë pajisje» ose në «OperiX Cloud»", "Shfletuesi ose modeli i telefonit"]
    : ["The product and platform (web or mobile)", "What you were trying to do and what happened", "The error message, if there is one", "Whether your data is stored “On this device” or in “OperiX Cloud”", "Your browser or phone model"];
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" />
    <div className="support-page-heading"><p className="eyebrow">OperiX Help Center</p><h1>{copy(locale, "stillNeedHelp")}</h1><p>{sq ? "Dokumentacioni është vendi më i shpejtë për të gjetur përgjigje. Nëse ende ju duhet ndihmë, shkruani ekipit tonë." : "The documentation is the fastest place to find answers. If you still need help, write to our team."}</p></div>
    <div className="support-grid">
      <a className="support-card support-card-primary" href={primaryHref}><span className="quick-icon"><Mail size={22} /></span><strong>{sq ? "Shkruani ekipit të mbështetjes" : "Email our support team"}</strong><span>{configured ? (sq ? "Hapni kanalin e mbështetjes." : "Open the support channel.") : supportEmail}</span></a>
      <Link className="support-card" href={troubleshootingPath(locale)}><span className="quick-icon"><Wrench size={22} /></span><strong>{copy(locale, "troubleshooting")}</strong><span>{sq ? "Zgjidhje për problemet më të shpeshta." : "Fixes for the most common problems."}</span></Link>
      <Link className="support-card" href={docsPath(locale, "invoice")}><span className="quick-icon"><BookOpen size={22} /></span><strong>{sq ? "Dokumentacioni i OperiX Invoice" : "OperiX Invoice documentation"}</strong><span>{sq ? "Udhëzime për web dhe celular." : "Guides for web and mobile."}</span></Link>
      <Link className="support-card" href={apiPath(locale)}><span className="quick-icon"><Code2 size={22} /></span><strong>{sq ? "API për zhvilluesit" : "API for developers"}</strong><span>{sq ? "Referenca dhe shembuj kodi." : "Reference and code samples."}</span></Link>
    </div>
    <section className="support-include"><h2>{sq ? "Çfarë të përfshini në mesazh" : "What to include in your message"}</h2><ul>{include.map((item) => <li key={item}>{item}</li>)}</ul><p>{sq ? "Mos dërgoni kurrë fjalëkalime ose çelësa API." : "Never send passwords or API keys."}</p></section>
  </main></div></div>;
}
