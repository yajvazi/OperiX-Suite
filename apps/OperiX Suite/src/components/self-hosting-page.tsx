import { Check, Github } from "lucide-react";
import { getCopy, urls, type Lang } from "@/content/copy";
import { Icon } from "./icons";
import { Reveal } from "./reveal";

export function SelfHostingPage({ lang }: { lang: Lang }) {
  const t = getCopy(lang).selfhosting;
  const mail = `mailto:${urls.email}?subject=${encodeURIComponent(t.subject)}`;
  return <>
    <section className="page-hero page-hero-selfhost">
      <div className="container center">
        <span className="label">{t.hero.label}</span>
        <h1>{t.hero.title}</h1>
        <p className="lead lead-center">{t.hero.sub}</p>
        <p className="selfhost-free"><span className="pill pill-live">{t.hero.free}</span></p>
        <div className="button-row button-row-center">
          <a className="button button-lg" href={urls.repo} target="_blank" rel="noopener noreferrer"><Github size={18} /> {t.hero.github}</a>
          <a className="button button-secondary button-lg" href={mail}>{t.hero.ask}</a>
        </div>
        <p className="fine-print">{t.hero.license}</p>
      </div>
    </section>

    <section className="section">
      <div className="container">
        <Reveal className="section-head"><span className="label">{t.features.label}</span><h2>{t.features.title}</h2><p>{t.features.sub}</p></Reveal>
        <div className="selfhost-grid">
          {t.features.items.map((item, index) => <Reveal key={item.title} className="selfhost-card" delay={index * 60}><span className="icon-tile"><Icon name={item.icon} /></span><h3>{item.title}</h3><p>{item.text}</p></Reveal>)}
        </div>
      </div>
    </section>

    <section className="section section-tint">
      <div className="container">
        <Reveal className="section-head"><span className="label">{t.how.label}</span><h2>{t.how.title}</h2><p>{t.how.sub}</p></Reveal>
        <ol className="steps">
          {t.how.steps.map((step, index) => <Reveal key={step.title} className="step" delay={index * 70}><span className="step-number">{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p>{step.code ? <pre className="code-block"><code>{step.code}</code></pre> : null}</Reveal>)}
        </ol>
        <div className="selfhost-requirements">
          <h3>{t.requirements.title}</h3>
          <ul className="check-list">{t.requirements.items.map((item) => <li key={item}><Check size={18} aria-hidden="true" /><span>{item}</span></li>)}</ul>
        </div>
      </div>
    </section>

    <section className="section">
      <div className="container narrow">
        <div className="section-head"><h2>{t.compare.title}</h2></div>
        <div className="table-wrap"><table className="compare compare-compact">
          <thead><tr><th scope="col"><span className="sr-only">{t.compare.title}</span></th><th scope="col">{t.compare.head[1]}</th><th scope="col">{t.compare.head[2]}</th></tr></thead>
          <tbody>{t.compare.rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.self}</td><td>{row.cloud}</td></tr>)}</tbody>
        </table></div>
      </div>
    </section>

    <section className="section section-tint">
      <div className="container narrow">
        <div className="section-head"><h2>{t.notices.title}</h2></div>
        <ul className="check-list check-list-wide">{t.notices.items.map((item) => <li key={item}><Check size={18} aria-hidden="true" /><span>{item}</span></li>)}</ul>
        <div className="selfhost-license"><h3>{t.license.title}</h3><p>{t.license.text}</p></div>
      </div>
    </section>

    <section className="cta-band">
      <div className="container cta-inner">
        <h2>{t.cta.title}</h2><p>{t.cta.sub}</p>
        <div className="button-row button-row-center">
          <a className="button button-light button-lg" href={urls.repo} target="_blank" rel="noopener noreferrer"><Github size={18} /> {t.cta.github}</a>
          <a className="button button-secondary button-lg" href={mail}>{t.cta.ask}</a>
        </div>
      </div>
    </section>
  </>;
}
