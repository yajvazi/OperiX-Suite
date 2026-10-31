import Link from "next/link";
import { ArrowRight, Check, Code2 } from "lucide-react";
import { getCopy, href, localUrl, urls, type Lang } from "@/content/copy";
import { euro, prices } from "@/content/prices";
import { Faq, faqSchema } from "./faq";
import { Icon } from "./icons";
import { BrowserFrame, PhoneMock } from "./mockups";
import { Reveal } from "./reveal";

export function HomePage({ lang }: { lang: Lang }) {
  const t = getCopy(lang);
  const h = t.home;
  return <>
    <section className="hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="container hero-grid">
        <div className="hero-copy">
          <h1>{h.hero.title} <span className="accent">{h.hero.accent}</span></h1>
          <p className="lead">{h.hero.sub}</p>
          <div className="button-row">
            <a className="button button-lg" href={localUrl(urls.signup, lang)}>{h.hero.primary} <ArrowRight size={18} /></a>
            <Link className="button button-lg button-secondary" href={href(lang, "/pricing")}>{h.hero.secondary}</Link>
          </div>
          <ul className="hero-notes">{h.hero.note.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
        </div>
        <div className="hero-visual">
          <BrowserFrame src="/shots/dashboard.webp" alt={lang === "sq" ? "Paneli kryesor i OperiX Invoice me të ardhura, fatura të pagura dhe të vonuara" : "The OperiX Invoice dashboard showing revenue, paid and overdue invoices"} priority />
          <PhoneMock lang={lang} className="hero-phone" />
        </div>
      </div>
    </section>

    <section className="section" id="products">
      <div className="container">
        <Reveal className="section-head"><span className="label">{h.products.label}</span><h2>{h.products.title}</h2><p>{h.products.sub}</p></Reveal>
        <div className="product-grid">
          <Reveal className="product-card product-card-live">
            <div className="product-top"><img src="/brand/operix-invoice-logo.svg" alt="" width={56} height={56} /><span className="pill pill-live">{h.products.invoice.badge}</span></div>
            <h3>{h.products.invoice.name}</h3>
            <p>{h.products.invoice.text}</p>
            <ul className="checks">{h.products.invoice.bullets.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul>
            <div className="button-row">
              <a className="button" href={localUrl(urls.signup, lang)}>{h.products.invoice.primary}</a>
              <Link className="button button-secondary" href={href(lang, "/invoice")}>{h.products.invoice.secondary}</Link>
            </div>
          </Reveal>
          <Reveal className="product-card product-card-soon" delay={90}>
            <div className="product-top"><img src="/brand/operix-booking-logo-blue.svg" alt="" width={56} height={56} /><span className="pill pill-soon">{h.products.booking.badge}</span></div>
            <h3>{h.products.booking.name}</h3>
            <p>{h.products.booking.text}</p>
            <ul className="checks">{h.products.booking.bullets.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul>
            <div className="button-row"><Link className="button button-secondary" href={href(lang, "/booking")}>{h.products.booking.primary}</Link></div>
          </Reveal>
        </div>
      </div>
    </section>

    <section className="section section-tint">
      <div className="container">
        <Reveal className="section-head"><span className="label">{h.features.label}</span><h2>{h.features.title}</h2><p>{h.features.sub}</p></Reveal>
        <div className="feature-grid">
          {h.features.items.map((item, index) => <Reveal key={item.title} className="feature" delay={(index % 4) * 60}><span className="icon-tile"><Icon name={item.icon} /></span><h3>{item.title}</h3><p>{item.text}</p></Reveal>)}
        </div>
      </div>
    </section>

    <section className="section">
      <div className="container showcase">
        <Reveal className="showcase-copy">
          <span className="label">{h.platforms.label}</span>
          <h2>{h.platforms.title}</h2>
          <p>{h.platforms.sub}</p>
          <div className="platform-cards">
            {[h.platforms.web, h.platforms.mobile].map((item) => <div className="platform-card" key={item.title}><h3>{item.title}</h3><p>{item.text}</p><ul className="checks checks-tight">{item.items.map((entry) => <li key={entry}><Check size={15} />{entry}</li>)}</ul></div>)}
          </div>
        </Reveal>
        <Reveal className="showcase-visual" delay={100}>
          <BrowserFrame src="/shots/invoices.webp" alt={lang === "sq" ? "Lista e faturave në OperiX Invoice" : "The invoice list in OperiX Invoice"} />
          <PhoneMock lang={lang} variant="pos" className="showcase-phone" />
        </Reveal>
      </div>
    </section>

    <section className="section section-dark" id="data">
      <div className="container">
        <Reveal className="section-head section-head-light"><span className="label label-light">{h.data.label}</span><h2>{h.data.title}</h2><p>{h.data.sub}</p></Reveal>
        <div className="data-grid">
          {[{ ...h.data.device, icon: "device" as const, tone: "free" }, { ...h.data.cloud, icon: "cloud" as const, tone: "paid" }].map((item, index) => <Reveal key={item.title} delay={index * 90} className={`data-card data-card-${item.tone}`}>
            <div className="data-card-top"><span className="icon-tile icon-tile-light"><Icon name={item.icon} /></span><span className="pill pill-light">{item.badge}</span></div>
            <h3>{item.title}</h3><p>{item.text}</p>
            <ul className="checks checks-light">{item.items.map((entry) => <li key={entry}><Check size={16} />{entry}</li>)}</ul>
          </Reveal>)}
        </div>
      </div>
    </section>

    <section className="section section-selfhost" id="open-source">
      <div className="container">
        <Reveal className="section-head"><span className="label"><Code2 size={14} /> {h.selfhost.label}</span><h2>{h.selfhost.title}</h2><p>{h.selfhost.sub}</p><p><span className="pill pill-live">{h.selfhost.free}</span></p></Reveal>
        <div className="selfhost-grid">
          {h.selfhost.points.map((point, index) => <Reveal key={point.title} className="selfhost-card" delay={index * 70}><span className="icon-tile"><Icon name={point.icon} /></span><h3>{point.title}</h3><p>{point.text}</p></Reveal>)}
        </div>
        <Reveal className="selfhost-foot">
          <p className="selfhost-note">{h.selfhost.note}</p>
          <Link className="button" href={href(lang, "/self-hosting")}>{h.selfhost.cta}</Link>
        </Reveal>
      </div>
    </section>

    <section className="section">
      <div className="container">
        <Reveal className="section-head"><span className="label">{h.steps.label}</span><h2>{h.steps.title}</h2></Reveal>
        <ol className="steps">{h.steps.items.map((item, index) => <Reveal key={item.title} className="step" delay={index * 80}><span className="step-number">{index + 1}</span><h3>{item.title}</h3><p>{item.text}</p></Reveal>)}</ol>
      </div>
    </section>

    <section className="section section-tint">
      <div className="container">
        <Reveal className="section-head"><span className="label">{h.pricing.label}</span><h2>{h.pricing.title}</h2><p>{h.pricing.sub}</p></Reveal>
        <div className="price-strip">
          <div className="price-chip"><span>{t.pricing.plans.free.name}</span><strong>€0</strong><small>{t.pricing.plans.free.tagline}</small></div>
          <div className="price-chip price-chip-main"><span>{t.pricing.plans.invoice.name}</span><strong>{euro(prices.invoice.monthly)}<em>{t.pricing.per.month}</em></strong><small>{t.pricing.plans.invoice.tagline}</small></div>
          <div className="price-chip price-chip-soon"><span>{t.pricing.plans.suite.name}</span><strong>{t.comingSoon}</strong><small>{t.pricing.plans.suite.tagline}</small></div>
        </div>
        <div className="center"><Link className="button button-secondary" href={href(lang, "/pricing")}>{h.pricing.cta} <ArrowRight size={16} /></Link></div>
      </div>
    </section>

    <section className="section">
      <div className="container narrow">
        <Reveal className="section-head"><span className="label">{h.faq.label}</span><h2>{h.faq.title}</h2></Reveal>
        <Faq items={h.faq.items} />
      </div>
    </section>

    <section className="cta-band">
      <div className="container cta-inner">
        <h2>{h.cta.title}</h2><p>{h.cta.sub}</p>
        <div className="button-row button-row-center"><a className="button button-light button-lg" href={localUrl(urls.signup, lang)}>{h.cta.primary}</a><Link className="button button-outline-light button-lg" href={href(lang, "/pricing")}>{h.cta.secondary}</Link></div>
      </div>
    </section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchema(h.faq.items) }} />
  </>;
}
