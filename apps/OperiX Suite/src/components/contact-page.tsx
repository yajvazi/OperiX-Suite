import { BookOpen, Mail } from "lucide-react";
import { getCopy, type Lang } from "@/content/copy";
import { ContactForm } from "./contact-form";

export function ContactPage({ lang }: { lang: Lang }) {
  const c = getCopy(lang).contact;
  const icons = [BookOpen, Mail];
  return <>
    <section className="page-hero"><div className="container center"><h1>{c.hero.title}</h1><p className="lead lead-center">{c.hero.sub}</p></div></section>
    <section className="section">
      <div className="container contact-grid">
        <div className="contact-cards">
          {c.cards.map((card, index) => { const Icon = icons[index]; return <a key={card.title} className="contact-card" href={card.href}><span className="icon-tile"><Icon size={22} /></span><div><h3>{card.title}</h3><p>{card.text}</p><span className="text-link">{card.cta}</span></div></a>; })}
        </div>
        <ContactForm lang={lang} />
      </div>
    </section>
  </>;
}
