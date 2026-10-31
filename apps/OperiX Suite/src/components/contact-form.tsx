"use client";

import { FormEvent, useEffect, useState } from "react";
import { getCopy, urls, type Lang } from "@/content/copy";

/** A topic can be preselected from the link: /contact?topic=self-hosting. */
const TOPIC_FROM_LINK: Record<string, number> = { "self-hosting": 2 };

/** Opens the visitor's email app with the message filled in, and always shows the address in case no email app opens. */
export function ContactForm({ lang }: { lang: Lang }) {
  const f = getCopy(lang).contact.form;
  const [topic, setTopic] = useState(f.topics[0]);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("topic");
    const index = requested ? TOPIC_FROM_LINK[requested] : undefined;
    if (index === undefined || !f.topics[index]) return undefined;
    const timer = window.setTimeout(() => setTopic(f.topics[index]), 0);
    return () => window.clearTimeout(timer);
  }, [f.topics]);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = `${data.get("message")}\n\n— ${data.get("name")} (${data.get("email")})`;
    setSubmitted(true);
    window.location.href = `mailto:${urls.email}?subject=${encodeURIComponent(`${f.subject}: ${data.get("topic")}`)}&body=${encodeURIComponent(body)}`;
  }
  return <form className="form-card" onSubmit={onSubmit}>
    <div className="form-grid">
      <div className="field"><label htmlFor="name">{f.name}</label><input id="name" name="name" autoComplete="name" required /></div>
      <div className="field"><label htmlFor="email">{f.email}</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="field field-full"><label htmlFor="topic">{f.topic}</label><select id="topic" name="topic" value={topic} onChange={(event) => setTopic(event.target.value)}>{f.topics.map((option) => <option key={option}>{option}</option>)}</select></div>
      <div className="field field-full"><label htmlFor="message">{f.message}</label><textarea id="message" name="message" rows={5} required /></div>
    </div>
    <button className="button button-lg" type="submit">{f.send}</button>
    <p className="form-note">{f.note}</p>
    {submitted ? <p className="form-note" role="status">{f.fallback} <a href={`mailto:${urls.email}`}>{urls.email}</a></p> : null}
  </form>;
}
