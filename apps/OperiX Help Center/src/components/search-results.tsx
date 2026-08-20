import Link from "next/link";
import { ArrowRight, FileText, HelpCircle, Search } from "lucide-react";
import type { Locale } from "../content/types";
import { productDefinitions } from "../content/products";
import { copy } from "../content/ui";
import { searchDocumentation, highlightText, type SearchEntry } from "../lib/search";
import { docsPath } from "../lib/paths";
import { DocsSidebar } from "./docs-navigation";
import { Icon } from "./icons";
import { HeroSearch } from "./hero-search";
import { SearchAnalytics } from "./search-analytics";

export function SearchResultsPage({ locale, query }: { locale: Locale; query: string }) {
  const results = searchDocumentation(query, locale);
  return <div className="docs-page"><SearchAnalytics queryLength={query.length} resultCount={results.length} /><div className="site-container docs-overview-shell"><DocsSidebar locale={locale} /><main id="main-content" className="docs-overview-main"><div className="mobile-docs-slot" /><div className="search-results-heading"><p className="eyebrow">OperiX Help Center</p><h1>{query ? <>{copy(locale, "searchResultsFor")} “{query}”</> : "Search documentation"}</h1><HeroSearch locale={locale} placeholder={copy(locale, "searchDocumentation")} /><p className="search-result-count">{results.length} {results.length === 1 ? copy(locale, "result") : copy(locale, "results")}</p></div>{results.length ? <div className="search-result-list">{results.map((entry) => <SearchResult key={entry.id} entry={entry} query={query} />)}</div> : <EmptySearch locale={locale} query={query} />}</main></div></div>;
}

function SearchResult({ entry, query }: { entry: SearchEntry; query: string }) {
  const titleParts = highlightText(entry.title, query);
  return <Link className="search-result" href={entry.href}><span className="search-result-icon">{entry.kind === "faq" ? <HelpCircle size={18} /> : entry.kind === "api" ? <Icon name="code" size={18} /> : <FileText size={18} />}</span><span className="search-result-copy"><small>{entry.productName ?? entry.category ?? entry.kind.toUpperCase()}</small><strong>{titleParts.map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</strong><span>{entry.description}</span><small className="search-result-path">{entry.category ? `${entry.productName ? `${entry.productName} · ` : ""}${entry.category}` : "OperiX Help Center"}</small></span><ArrowRight size={16} /></Link>;
}

function EmptySearch({ locale, query }: { locale: Locale; query: string }) {
  return <div className="empty-search"><span><Search size={24} /></span><h2>{query ? `${copy(locale, "noSearchResults")} “${query}”.` : "Search guides and answers across OperiX."}</h2><p>{copy(locale, "tryDifferentSearch")}</p><div className="empty-search-links">{productDefinitions.slice(0, 4).map((product) => <Link href={docsPath(locale, product.key)} key={product.key}>{product.name}<ArrowRight size={14} /></Link>)}</div></div>;
}
