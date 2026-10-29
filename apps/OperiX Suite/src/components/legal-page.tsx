import { getCopy, type Lang } from "@/content/copy";

export function LegalPage({ lang, kind }: { lang: Lang; kind: "privacy" | "terms" }) {
  const t = getCopy(lang).legal;
  const doc = t[kind];
  return <>
    <section className="page-hero"><div className="container narrow"><h1>{doc.title}</h1><p className="lead-sm">{t.updated}</p></div></section>
    <section className="section"><article className="container narrow legal">{doc.sections.map((section) => <div key={section.h}><h2>{section.h}</h2>{section.p.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>)}<p className="fine-print">{t.review}</p></article></section>
  </>;
}
