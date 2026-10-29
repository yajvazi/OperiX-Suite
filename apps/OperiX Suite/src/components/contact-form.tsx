"use client";

import { FormEvent } from "react";
import { getCopy, urls, type Lang } from "@/content/copy";

/** Opens the visitor's email app with the message filled in. */
export function ContactForm({ lang }: { lang: Lang }) {
  const f = getCopy(lang).contact.form;
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = `${data.get("message")}\n\n— ${data.get("name")} (${data.get("email")})`;
    window.location.href = `mailto:${urls.email}?subject=${encodeURIComponent(`${f.subject}: ${data.get("topic")}`)}&body=${encodeURIComponent(body)}`;
  }
  return <form className="form-card" onSubmit={onSubmit}>
    <div className="form-grid">
      <div className="field"><label htmlFor="name">{f.name}</label><input id="name" name="name" autoComplete="name" required /></div>
      <div className="field"><label htmlFor="email">{f.email}</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="field field-full"><label htmlFor="topic">{f.topic}</label><select id="topic" name="topic" defaultValue={f.topics[0]}>{f.topics.map((topic) => <option key={topic}>{topic}</option>)}</select></div>
      <div className="field field-full"><label htmlFor="message">{f.message}</label><textarea id="message" name="message" rows={5} required /></div>
    </div>
    <button className="button button-lg" type="submit">{f.send}</button>
    <p className="form-note">{f.note}</p>
  </form>;
}
