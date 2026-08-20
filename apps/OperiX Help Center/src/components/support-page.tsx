import Link from "next/link";
import { ArrowRight, Headphones, ShieldCheck } from "lucide-react";
import type { Locale } from "../content/types";
import { copy } from "../content/ui";
import { docsPath } from "../lib/paths";
import { supportUrl } from "../lib/support";
import { DocsSidebar } from "./docs-navigation";

export function SupportPage({ locale }: { locale: Locale }) {
  const configured = supportUrl();
  return <div className="docs-page"><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><div className="support-page-heading"><span className="support-page-icon"><Headphones size={24} /></span><p className="eyebrow">OperiX Help Center</p><h1>{copy(locale, "stillNeedHelp")}</h1><p>Our documentation is the fastest place to find answers. If you still need help, use the support channel configured for your OperiX organization.</p></div>{configured ? <a className="support-primary-link" href={configured}>Contact Support <ArrowRight size={17} /></a> : <div className="support-not-configured"><ShieldCheck size={21} /><div><strong>Support channel not configured yet</strong><p>Set <code>NEXT_PUBLIC_SUPPORT_URL</code> to the official OperiX support destination when it is ready. No ticketing backend is created by this Help Center.</p></div></div>}<div className="support-next"><Link href={docsPath(locale)}>Browse documentation <ArrowRight size={15} /></Link><Link href={`/${locale}/faq`}>Read FAQs <ArrowRight size={15} /></Link></div></main></div></div>;
}
