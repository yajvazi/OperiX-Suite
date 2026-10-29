import Link from "next/link";
import { Mail } from "lucide-react";
import { getCopy, href, urls, type Lang } from "@/content/copy";
import { Icon } from "./icons";
import { Reveal } from "./reveal";

export function BookingPage({ lang }: { lang: Lang }) {
  const t = getCopy(lang);
  const b = t.booking;
  const mail = `mailto:${urls.email}?subject=${encodeURIComponent(b.waitlist.subject)}&body=${encodeURIComponent(b.waitlist.body)}`;
  return <>
    <section className="page-hero page-hero-booking">
      <div className="container page-hero-grid page-hero-center">
        <div>
          <span className="eyebrow eyebrow-soon"><span className="dot" />{b.badge}</span>
          <h1>{b.hero.title}</h1>
          <p className="lead">{b.hero.sub}</p>
          <div className="button-row"><a className="button button-lg" href="#waitlist">{b.hero.primary}</a></div>
        </div>
        <div className="calendar-art" aria-hidden="true">
          <div className="cal-head"><strong>{lang === "sq" ? "E enjte" : "Thursday"}</strong><span className="pill pill-soon">{b.badge}</span></div>
          {[["09:00", lang === "sq" ? "Prerje fillestare" : "Intro consultation", "blue"], ["10:30", lang === "sq" ? "Qethje flokësh" : "Haircut", "green"], ["13:00", lang === "sq" ? "Kontroll i përgjithshëm" : "Check-up", "amber"], ["15:30", lang === "sq" ? "Seancë trajnimi" : "Training session", "blue"]].map(([time, label, tone]) => <div className={`cal-slot tone-${tone}`} key={time}><span>{time}</span><b>{label}</b></div>)}
        </div>
      </div>
    </section>
    <section className="section">
      <div className="container">
        <div className="feature-grid">
          {b.features.map((item, index) => <Reveal key={item.title} className="feature" delay={(index % 4) * 60}><span className="icon-tile"><Icon name={item.icon} /></span><h3>{item.title}</h3><p>{item.text}</p></Reveal>)}
        </div>
      </div>
    </section>
    <section className="section section-tint">
      <div className="container split">
        <Reveal><span className="label">{b.why.label}</span><h2>{b.why.title}</h2><p className="lead-sm">{b.why.text}</p></Reveal>
        <Reveal delay={90} className="note-card note-card-big"><span className="icon-tile"><Icon name="layers" /></span><div><h3>{b.suite.title}</h3><p>{b.suite.text}</p><Link className="button button-secondary button-sm" href={href(lang, "/pricing")}>{b.suite.cta}</Link></div></Reveal>
      </div>
    </section>
    <section className="cta-band" id="waitlist">
      <div className="container cta-inner">
        <h2>{b.waitlist.title}</h2><p>{b.waitlist.text}</p>
        <div className="button-row button-row-center"><a className="button button-light button-lg" href={mail}><Mail size={18} /> {b.waitlist.cta}</a></div>
        <p className="cta-note">{b.waitlist.note}</p>
      </div>
    </section>
  </>;
}
