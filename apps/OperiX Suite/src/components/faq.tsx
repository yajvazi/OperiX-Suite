export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return <div className="faq">
    {items.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
  </div>;
}

export function faqSchema(items: { q: string; a: string }[]) {
  return JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) }).replace(/</g, "\\u003c");
}
