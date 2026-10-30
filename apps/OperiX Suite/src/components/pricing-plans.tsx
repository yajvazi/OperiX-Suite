"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useState } from "react";
import { getCopy, href, localUrl, urls, type Lang } from "@/content/copy";
import { euro, prices } from "@/content/prices";

export function PricingPlans({ lang }: { lang: Lang }) {
  const t = getCopy(lang).pricing;
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const per = interval === "monthly" ? t.per.month : t.per.year;
  const priced = (plan: "invoice") => euro(prices[plan][interval]);
  return <>
    <div className="interval" role="group" aria-label={`${t.monthly} / ${t.annual}`}>
      <button type="button" aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>{t.monthly}</button>
      <button type="button" aria-pressed={interval === "annual"} onClick={() => setInterval("annual")}>{t.annual}<span className="save">{t.saveBadge}</span></button>
    </div>
    <div className="plan-grid">
      <article className="plan">
        <h3>{t.plans.free.name}</h3><p className="plan-tag">{t.plans.free.tagline}</p>
        <div className="plan-price"><strong>{t.freePrice}</strong></div>
        <a className="button button-secondary button-block" href={localUrl(urls.signup, lang)}>{t.plans.free.cta}</a>
        <p className="plan-included">{t.included}</p>
        <ul className="checks checks-tight">{t.plans.free.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
      </article>
      <article className="plan plan-popular">
        <span className="plan-badge">{t.plans.invoice.popular}</span>
        <h3>{t.plans.invoice.name}</h3><p className="plan-tag">{t.plans.invoice.tagline}</p>
        <div className="plan-price"><strong>{priced("invoice")}</strong><span>{per}</span></div>
        <a className="button button-block" href={localUrl(urls.signup, lang)}>{t.plans.invoice.cta}</a>
        <p className="plan-included">{t.included}</p>
        <ul className="checks checks-tight">{t.plans.invoice.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
      </article>
      <article className="plan plan-soon">
        <span className="plan-badge plan-badge-soon">{t.plans.suite.badge}</span>
        <h3>{t.plans.suite.name}</h3><p className="plan-tag">{t.plans.suite.tagline}</p>
        <div className="plan-price"><strong className="plan-price-soon">{t.plans.suite.badge}</strong></div>
        <Link className="button button-secondary button-block" href={href(lang, "/booking")}>{t.plans.suite.cta}</Link>
        <p className="plan-included">{t.included}</p>
        <ul className="checks checks-tight">{t.plans.suite.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
      </article>
      <article className="plan plan-soon">
        <span className="plan-badge plan-badge-soon">{t.plans.booking.badge}</span>
        <h3>{t.plans.booking.name}</h3><p className="plan-tag">{t.plans.booking.tagline}</p>
        <div className="plan-price"><strong className="plan-price-soon">{t.plans.booking.badge}</strong></div>
        <Link className="button button-secondary button-block" href={href(lang, "/booking")}>{t.plans.booking.cta}</Link>
        <p className="plan-included">{t.included}</p>
        <ul className="checks checks-tight">{t.plans.booking.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
      </article>
    </div>
    <div className="addons">
      <div className="addons-head"><h2>{t.addons.title}</h2><p>{t.addons.sub}</p></div>
      <div className="addon-grid">
        {t.addons.items.map((item, index) => { const value = index === 0 ? prices.extraWorkspace : prices.extraUser; return <div className="addon" key={item.name}><div><h3>{item.name}</h3><p>{item.text}</p></div><strong>{euro(value[interval])}<span>{per}</span></strong></div>; })}
        <div className="addon"><div><h3>{t.addons.api.name}</h3><p>{t.addons.api.text}</p></div><strong>{euro(prices.api.monthly)}<span>{t.per.month}</span></strong></div>
      </div>
    </div>
  </>;
}
