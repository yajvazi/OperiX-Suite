import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bookingArticles } from "../content/booking-docs";
import { bookingFeatureRegistry, bookingRegistryMetadata } from "../content/booking-registry";
import type { Locale } from "../content/types";

function featureArticles(featureId: string) {
  return bookingArticles.filter((article) => article.featureId === featureId);
}

function readGeneratedJson<T>(relativePath: string, fallback: T): T {
  const candidates = [resolve(process.cwd(), "../../docs/booking", relativePath), resolve(process.cwd(), "docs/booking", relativePath)];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return fallback;
  try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return fallback; }
}

export function BookingDocsHealth({ locale }: { locale: Locale }) {
  const userFacing = bookingFeatureRegistry.filter((feature) => !["internal/non-user-facing", "deprecated"].includes(feature.classification));
  const documented = userFacing.filter((feature) => feature.documentation?.en && feature.documentation?.sq);
  const rows = bookingFeatureRegistry.map((feature) => {
    const articles = featureArticles(feature.id);
    const screenshots = feature.screenshots ?? [];
    const captured = screenshots.filter((id) => existsSync(resolve(process.cwd(), "public", "screenshots/booking", `${id}.png`)));
    const authoredStatus = articles.find((article) => article.documentationStatus && article.documentationStatus !== "CURRENT")?.documentationStatus;
    const status = feature.classification === "deprecated" ? "DEPRECATED" : feature.classification === "internal/non-user-facing" ? "INTERNAL" : authoredStatus ?? (feature.documentation?.en && feature.documentation?.sq && articles.length >= 2 ? "CURRENT" : "MISSING");
    return { feature, articles, screenshots, captured, status };
  });
  const web = userFacing.filter((feature) => feature.platforms.includes("web"));
  const mobile = userFacing.filter((feature) => feature.platforms.includes("mobile"));
  const coverage = readGeneratedJson<{ totals?: { routeWarnings?: number; screenWarnings?: number }; warnings?: string[] }>("generated/coverage-report.json", {});
  const readiness = readGeneratedJson<{ applicationCommit?: string; outdated?: number; reviewRequired?: number }>("generated/readiness-report.json", {});
  const syncState = readGeneratedJson<{ generatedOn?: string; applicationCommit?: string }>("registry/sync-state.json", {});
  const manifest = readGeneratedJson<{ generatedOn?: string }>("screenshot-manifest/screenshot-manifest.json", {});
  const visualDiff = readGeneratedJson<{ generatedOn?: string; changed?: number; pending?: number }>("screenshot-manifest/visual-diff-report.json", {});
  const routeWarnings = Number(coverage.totals?.routeWarnings || 0) + Number(coverage.totals?.screenWarnings || 0);
  const latestApplicationCommit = readiness.applicationCommit || syncState.applicationCommit || bookingRegistryMetadata.auditCommit || "unknown";
  const metric = (label: string, value: string, tone = "") => <div className={`booking-health-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
  return <main className="booking-health-page site-container" id="main-content">
    <div className="booking-health-heading"><p className="eyebrow">Internal documentation administration</p><h1>{locale === "sq" ? "Shëndeti i dokumentacionit Booking" : "Booking Documentation Health"}</h1><p>{locale === "sq" ? "Pamje e mbulimit, sinkronizimit dhe pamjeve të verifikuara për Web dhe Mobile." : "Coverage, synchronization, and screenshot status for Booking Web and Mobile."}</p></div>
    <div className="booking-health-metrics">
      {metric("Booking features", String(bookingFeatureRegistry.length))}
      {metric("Documented", `${documented.length}/${userFacing.length}`)}
      {metric("Web coverage", `${Math.round((web.filter((feature) => feature.documentation?.en && feature.documentation?.sq).length / Math.max(web.length, 1)) * 100)}%`)}
      {metric("Mobile coverage", `${Math.round((mobile.filter((feature) => feature.documentation?.en && feature.documentation?.sq).length / Math.max(mobile.length, 1)) * 100)}%`)}
      {metric("English", `${Math.round((documented.length / Math.max(userFacing.length, 1)) * 100)}%`)}
      {metric("Shqip", `${Math.round((documented.length / Math.max(userFacing.length, 1)) * 100)}%`)}
      {metric("Screenshots", `${rows.reduce((sum, row) => sum + row.captured.length, 0)}/${rows.reduce((sum, row) => sum + row.screenshots.length, 0)}`)}
      {metric("Review required", String(rows.filter((row) => row.status === "REVIEW_REQUIRED").length), "is-warning")}
    </div>
    <section className="booking-health-verification" aria-labelledby="booking-health-verification-title"><div><p className="eyebrow">Verification</p><h2 id="booking-health-verification-title">Synchronization details</h2></div><dl><div><dt>Stale articles</dt><dd>{readiness.outdated ?? 0}</dd></div><div><dt>Broken links / routes</dt><dd>{routeWarnings}</dd></div><div><dt>Latest sync</dt><dd>{syncState.generatedOn || "Not recorded"}</dd></div><div><dt>Screenshot verification</dt><dd>{visualDiff.changed || visualDiff.pending ? `${visualDiff.changed || 0} changed · ${visualDiff.pending || 0} pending` : manifest.generatedOn || "Not recorded"}</dd></div><div><dt>Application commit checked</dt><dd><code>{latestApplicationCommit.slice(0, 12)}</code></dd></div><div><dt>Validation warnings</dt><dd>{coverage.warnings?.length || 0}</dd></div></dl></section>
    <section className="booking-health-panel" aria-labelledby="booking-health-table-title"><div className="booking-health-panel-heading"><div><p className="eyebrow">Registry coverage</p><h2 id="booking-health-table-title">Feature coverage</h2></div><span>EN + SQ pairs · Web + Mobile mapping</span></div><div className="booking-health-table-wrap"><table className="booking-health-table"><thead><tr><th>Feature</th><th>Web</th><th>Mobile</th><th>EN</th><th>SQ</th><th>Visuals</th><th>Status</th></tr></thead><tbody>{rows.map(({ feature, articles, screenshots, captured, status }) => <tr key={feature.id}><th scope="row"><strong>{feature.name}</strong><small>{feature.id}</small></th><td>{feature.platforms.includes("web") ? "✓" : "—"}</td><td>{feature.platforms.includes("mobile") ? "✓" : "—"}</td><td>{feature.documentation?.en && articles.some((article) => article.locale === "en") ? "✓" : "—"}</td><td>{feature.documentation?.sq && articles.some((article) => article.locale === "sq") ? "✓" : "—"}</td><td>{screenshots.length ? `${captured.length}/${screenshots.length}` : "—"}</td><td><span className={`booking-health-status booking-health-status-${status.toLowerCase()}`}>{status}</span></td></tr>)}</tbody></table></div></section>
    <p className="booking-health-footnote">Generated from the Booking feature registry and authored EN/SQ content. This page is intentionally not linked in public navigation; protect the route with the Help Center’s deployment access policy before exposing it outside internal preview.</p>
  </main>;
}
