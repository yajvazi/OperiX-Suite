import { Check, Minus } from "lucide-react";
import { getCopy, localUrl, urls, type Lang } from "@/content/copy";
import { Faq, faqSchema } from "./faq";
import { Icon } from "./icons";
import { PricingPlans } from "./pricing-plans";

export function PricingPage({ lang }: { lang: Lang }) {
  const t = getCopy(lang).pricing;
  const cell = (value: string | boolean) => value === true ? <Check size={18} className="yes" aria-label="Yes" /> : value === false ? <Minus size={18} className="no" aria-label="No" /> : <span>{value}</span>;
  return <>
    <section className="page-hero page-hero-pricing">
      <div className="container center"><h1>{t.hero.title}</h1><p className="lead lead-center">{t.hero.sub}</p></div>
    </section>
    <section className="section section-pricing"><div className="container"><PricingPlans lang={lang} /><p className="fine-print">{t.vat}</p></div></section>
    <section className="section">
      <div className="container"><div className="selfhost-banner"><span className="icon-tile"><Icon name="code" /></span><div><h2>{t.selfhost.title}</h2><p>{t.selfhost.text}</p></div><a className="button button-secondary" href={`mailto:${urls.email}?subject=${encodeURIComponent(getCopy(lang).home.selfhost.subject)}`}>{t.selfhost.cta}</a></div></div>
    </section>
    <section className="section section-tint">
      <div className="container narrow">
        <div className="section-head"><h2>{t.compare.title}</h2><p>{t.compare.sub}</p></div>
        <div className="table-wrap"><table className="compare">
          <thead><tr><th scope="col">{t.compare.head[0]}</th><th scope="col">{t.compare.head[1]}</th><th scope="col">{t.compare.head[2]}</th></tr></thead>
          <tbody>{t.compare.rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{cell(row.free)}</td><td>{cell(row.paid)}</td></tr>)}</tbody>
        </table></div>
      </div>
    </section>
    <section className="section">
      <div className="container narrow"><div className="section-head"><h2>{t.faq.title}</h2></div><Faq items={t.faq.items} /></div>
    </section>
    <section className="cta-band">
      <div className="container cta-inner"><h2>{getCopy(lang).home.cta.title}</h2><p>{getCopy(lang).home.cta.sub}</p><div className="button-row button-row-center"><a className="button button-light button-lg" href={localUrl(urls.signup, lang)}>{getCopy(lang).home.cta.primary}</a></div></div>
    </section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchema(t.faq.items) }} />
  </>;
}
