import Link from "next/link";
import { ArrowRight, Headphones } from "lucide-react";
import type { Locale } from "../content/types";
import { supportPath } from "../lib/paths";
import { supportUrl } from "../lib/support";

export function SupportCta({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const configured = supportUrl();
  const content = <><span className="support-icon"><Headphones size={21} /></span><span><strong>{locale === "sq" ? "Keni ende nevojë për ndihmë?" : "Still Need Help?"}</strong><small>{locale === "sq" ? "Ekipi ynë mund t'ju ndihmojë." : "Our support team can help."}</small></span><span className="support-action">{locale === "sq" ? "Kontakto mbështetjen" : "Contact Support"}<ArrowRight size={15} /></span></>;
  return configured ? <a className={`support-cta ${compact ? "is-compact" : ""}`} href={configured}>{content}</a> : <Link className={`support-cta ${compact ? "is-compact" : ""}`} href={supportPath(locale)}>{content}</Link>;
}
