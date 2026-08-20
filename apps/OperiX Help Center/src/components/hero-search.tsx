"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import type { Locale } from "../content/types";
import { popularSearchEntries } from "../lib/search";
import { localePath } from "../lib/paths";

export function HeroSearch({ locale, placeholder }: { locale: Locale; placeholder: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const popular = popularSearchEntries(locale).slice(0, 4);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    router.push(`${localePath(locale, "/search")}?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="hero-search-wrap">
      <form className="hero-search" onSubmit={submit} role="search">
        <Search size={21} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 120)} placeholder={placeholder} aria-label={placeholder} />
        <kbd>⌘ K</kbd>
        <button type="submit" aria-label="Search"><ArrowRight size={19} /></button>
      </form>
      {focused ? <div className="hero-search-suggestions" role="listbox" aria-label="Search suggestions">{popular.map((entry) => <button type="button" key={entry.id} onMouseDown={() => router.push(entry.href)}><Search size={14} /><span>{entry.title}</span><ArrowRight size={14} /></button>)}</div> : null}
    </div>
  );
}
