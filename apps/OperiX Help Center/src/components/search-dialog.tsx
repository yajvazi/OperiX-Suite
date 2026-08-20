"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, Command, Search, X } from "lucide-react";
import type { Locale } from "../content/types";
import { productDefinitions } from "../content/products";
import { popularSearchEntries, searchDocumentation, type SearchEntry } from "../lib/search";
import { localePath } from "../lib/paths";
import { trackDocsEvent } from "../lib/analytics";

const suggestedSearches = ["invoice payment", "getting started", "roles and permissions", "creating a booking"];

function readRecentSearches() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem("operix-help-recent-searches") ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === "undefined") return [];
  const next = [query, ...readRecentSearches().filter((item) => item !== query)].slice(0, 5);
  window.localStorage.setItem("operix-help-recent-searches", JSON.stringify(next));
  return next;
}

export function SearchDialog({ locale }: { locale: Locale }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isFormField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "/" && !isFormField) {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 20);
    document.body.classList.add("search-is-open");
    return () => {
      window.clearTimeout(timeout);
      document.body.classList.remove("search-is-open");
    };
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    navigateToSearch(query);
  }

  function choose(value: string) {
    navigateToSearch(value);
  }

  function navigateToSearch(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setRecent(saveRecentSearch(trimmed));
    trackDocsEvent({ type: "search", queryLength: trimmed.length, resultCount: searchDocumentation(trimmed, locale).length });
    setOpen(false);
    router.push(`${localePath(locale, "/search")}?q=${encodeURIComponent(trimmed)}`);
  }

  const liveResults = query.trim() ? searchDocumentation(query, locale).slice(0, 5) : [];
  const popular = popularSearchEntries(locale).slice(0, 5);
  const overlay = open ? <div className="search-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-dialog-title">
      <div className="search-dialog-topline">
        <span id="search-dialog-title">Search the Help Center</span>
        <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close search"><X size={18} /></button>
      </div>
      <form className="search-dialog-form" onSubmit={submit}>
        <Search size={19} aria-hidden="true" />
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guides, documentation and answers..." aria-label="Search guides, documentation and answers" autoComplete="off" />
        <kbd>Esc</kbd>
      </form>
      <div className="search-dialog-body">
        {liveResults.length ? (
          <div className="search-suggestion-group">
            <p className="search-group-label">Results</p>
            {liveResults.map((entry) => <Suggestion key={entry.id} entry={entry} onChoose={() => choose(entry.title)} />)}
          </div>
        ) : null}
        {!query.trim() ? (
          <>
            {recent.length ? <div className="search-suggestion-group"><p className="search-group-label"><Clock3 size={13} />Recent Searches</p>{recent.map((item) => <button type="button" className="suggestion-row" key={item} onClick={() => choose(item)}><Clock3 size={15} /><span>{item}</span><ArrowRight size={14} /></button>)}</div> : null}
            <div className="search-suggestion-group"><p className="search-group-label">Popular Articles</p>{popular.map((entry) => <Suggestion key={entry.id} entry={entry} onChoose={() => choose(entry.title)} />)}</div>
            <div className="search-suggestion-group"><p className="search-group-label">Products</p><div className="search-product-links">{productDefinitions.map((product) => <button type="button" key={product.key} onClick={() => choose(product.name)}>{product.name}</button>)}</div></div>
            <div className="search-suggestion-group"><p className="search-group-label">Suggested Searches</p><div className="search-product-links">{suggestedSearches.map((item) => <button type="button" key={item} onClick={() => choose(item)}>{item}</button>)}</div></div>
          </>
        ) : null}
        {query.trim() && !liveResults.length ? <div className="search-empty-inline"><Search size={19} /><strong>No suggestions yet</strong><span>Press Enter to see all results.</span></div> : null}
      </div>
    </section>
  </div> : null;

  return (
    <>
      <button type="button" className="header-search-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Search documentation">
        <Search size={16} />
        <span>Search</span>
        <kbd><Command size={11} />K</kbd>
      </button>
      {overlay && typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
    </>
  );
}

function Suggestion({ entry, onChoose }: { entry: SearchEntry; onChoose: () => void }) {
  return <button type="button" className="suggestion-row" onClick={onChoose}><span className="suggestion-icon"><Search size={14} /></span><span className="suggestion-copy"><strong>{entry.title}</strong><small>{entry.productName ?? entry.category ?? entry.kind.toUpperCase()}</small></span><ArrowRight size={14} /></button>;
}
