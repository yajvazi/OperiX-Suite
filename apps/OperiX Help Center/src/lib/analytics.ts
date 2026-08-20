export type DocsAnalyticsEvent =
  | { type: "article_view"; articleId: string }
  | { type: "search"; queryLength: number; resultCount: number }
  | { type: "article_feedback"; articleId?: string; helpful: boolean };

/**
 * Privacy-first analytics seam. It emits an in-browser event only; an approved
 * OperiX analytics adapter can subscribe later without coupling content pages
 * to a vendor or sending raw search terms to a third party.
 */
export function trackDocsEvent(event: DocsAnalyticsEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("operix:docs-analytics", { detail: event }));
}
