import Link from "next/link";
import { Check } from "lucide-react";
import { getCopy, href, localUrl, urls, type Lang } from "@/content/copy";
import { Icon } from "./icons";
import { BrowserFrame } from "./mockups";
import { Reveal } from "./reveal";

export function InvoicePage({ lang }: { lang: Lang }) {
  const t = getCopy(lang);
  const p = t.invoice;
  return <>
    <section className="page-hero">
      <div className="container page-hero-grid">
        <div>
          <span className="eyebrow"><span className="dot" />{p.hero.eyebrow}</span>
          <h1>{p.hero.title}</h1>
          <p className="lead">{p.hero.sub}</p>
          <div className="button-row"><a className="button button-lg" href={localUrl(urls.signup, lang)}>{p.hero.primary}</a><Link className="button button-lg button-secondary" href={href(lang, "/pricing")}>{p.hero.secondary}</Link></div>
        </div>
        <BrowserFrame src="/shots/invoice-detail.webp" alt={lang === "sq" ? "Një faturë në OperiX Invoice me përmbledhje dhe pamje paraprake të dokumentit" : "An invoice in OperiX Invoice with its summary and document preview"} priority />
      </div>
    </section>
    <section className="section">
      <div className="container group-grid">
        {p.groups.map((group, index) => <Reveal key={group.title} className="group-card" delay={(index % 3) * 70}>
          <span className="icon-tile"><Icon name={group.icon} /></span>
          <h3>{group.title}</h3><p className="group-sub">{group.text}</p>
          <ul className="checks checks-tight">{group.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
        </Reveal>)}
      </div>
    </section>
    <section className="section section-tint">
      <div className="container split">
        <Reveal><span className="label">{p.kosovo.label}</span><h2>{p.kosovo.title}</h2><p className="lead-sm">{p.kosovo.text}</p></Reveal>
        <Reveal delay={90}><ul className="checks checks-big">{p.kosovo.items.map((item) => <li key={item}><Check size={18} />{item}</li>)}</ul><div className="note-card"><span className="icon-tile"><Icon name="globe" /></span><div><h3>{p.languages.title}</h3><p>{p.languages.text}</p></div></div></Reveal>
      </div>
    </section>
    <section className="cta-band">
      <div className="container cta-inner">
        <h2>{t.home.cta.title}</h2><p>{t.home.cta.sub}</p>
        <div className="button-row button-row-center"><a className="button button-light button-lg" href={localUrl(urls.signup, lang)}>{t.home.cta.primary}</a><Link className="button button-outline-light button-lg" href={href(lang, "/pricing")}>{t.home.cta.secondary}</Link></div>
      </div>
    </section>
  </>;
}
