import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, CheckCircle2, CircleAlert, Image as ImageIcon, Languages, Smartphone, Globe2 } from "lucide-react";
import { invoiceCatalogArticles } from "../content/invoice-catalog.generated";
import type { Locale } from "../content/types";
import { articlePath } from "../lib/paths";

type FeatureRow = {
  featureId: string;
  title: string;
  web?: (typeof invoiceCatalogArticles)[number];
  mobile?: (typeof invoiceCatalogArticles)[number];
  en?: (typeof invoiceCatalogArticles)[number];
  sq?: (typeof invoiceCatalogArticles)[number];
};

function featureRows(): FeatureRow[] {
  const rows = new Map<string, FeatureRow>();
  for (const article of invoiceCatalogArticles) {
    const row = rows.get(article.featureId || article.id) || { featureId: article.featureId || article.id, title: article.title };
    if (!row.title || article.locale === "en") row.title = article.title;
    if (article.platforms?.[0] === "web") row.web = article;
    if (article.platforms?.[0] === "mobile") row.mobile = article;
    if (article.locale === "en") row.en = article;
    if (article.locale === "sq") row.sq = article;
    rows.set(row.featureId, row);
  }
  return [...rows.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function InvoiceDocumentationHealth({ locale }: { locale: Locale }) {
  const rows = featureRows();
  const total = rows.length;
  const current = rows.filter((row) => row.en?.status === "CURRENT" && row.sq?.status === "CURRENT").length;
  const review = rows.filter((row) => row.en?.status === "REVIEW_REQUIRED" || row.sq?.status === "REVIEW_REQUIRED").length;
  const en = rows.filter((row) => row.en).length;
  const sq = rows.filter((row) => row.sq).length;
  const web = rows.filter((row) => row.web).length;
  const mobile = rows.filter((row) => row.mobile).length;
  const screenshotBlocks = invoiceCatalogArticles.flatMap((article) => article.blocks.filter((block) => block.type === "screenshot"));
  const capturedScreenshots = screenshotBlocks.filter((block) => block.type === "screenshot" && Boolean(block.src)).length;
  const statusLabel = locale === "sq" ? "Statusi" : "Status";
  const labels = locale === "sq" ? {
    eyebrow: "Administrim i brendshëm",
    title: "Shëndeti i dokumentacionit të Invoice",
    description: "Pamje e mbulimit, sinkronizimit dhe rasteve që kërkojnë rishikim njerëzor.",
    features: "Funksione",
    articles: "Artikuj të lokalizuar",
    current: "Aktuale",
    review: "Kërkon rishikim",
    screenshots: "Pamje të kapura",
    language: "Mbulimi i gjuhëve",
    platform: "Mbulimi i platformave",
    feature: "Funksioni",
    web: "Web",
    mobile: "Mobile",
    english: "English",
    albanian: "Shqip",
    open: "Hap",
  } : {
    eyebrow: "Internal administration",
    title: "Invoice documentation health",
    description: "Coverage, synchronization, and human-review signals for the living Invoice documentation system.",
    features: "Features",
    articles: "Localized articles",
    current: "Current",
    review: "Review required",
    screenshots: "Captured screenshots",
    language: "Language coverage",
    platform: "Platform coverage",
    feature: "Feature",
    web: "Web",
    mobile: "Mobile",
    english: "English",
    albanian: "Shqip",
    open: "Open",
  };
  return <main className="invoice-health-page"><div className="site-container"><div className="invoice-health-heading"><p className="eyebrow">{labels.eyebrow}</p><h1>{labels.title}</h1><p>{labels.description}</p></div><div className="invoice-health-metrics"><Metric icon={<Activity size={17} />} label={labels.features} value={total} detail={`${web}/${total} ${labels.web} · ${mobile}/${total} ${labels.mobile}`} /><Metric icon={<Languages size={17} />} label={labels.articles} value={en + sq} detail={`${en} ${labels.english} · ${sq} ${labels.albanian}`} /><Metric icon={<CheckCircle2 size={17} />} label={labels.current} value={current} detail={`${total ? Math.round((current / total) * 100) : 0}% fully current`} /><Metric icon={<CircleAlert size={17} />} label={labels.review} value={review} detail={`${total ? Math.round((review / total) * 100) : 0}% of features`} /><Metric icon={<ImageIcon size={17} />} label={labels.screenshots} value={`${capturedScreenshots}/${screenshotBlocks.length}`} detail={`${screenshotBlocks.length ? Math.round((capturedScreenshots / screenshotBlocks.length) * 100) : 0}% captured`} /></div><section className="invoice-health-section"><div className="invoice-health-section-heading"><div><p className="eyebrow">{labels.language} · {labels.platform}</p><h2>{labels.feature}</h2></div><div className="invoice-health-legend"><span><Globe2 size={14} /> {labels.web} {web}/{total}</span><span><Smartphone size={14} /> {labels.mobile} {mobile}/{total}</span></div></div><div className="invoice-health-table-wrap"><table className="invoice-health-table"><thead><tr><th>{labels.feature}</th><th>{labels.web}</th><th>{labels.mobile}</th><th>{labels.english}</th><th>{labels.albanian}</th><th>{labels.screenshots}</th><th>{statusLabel}</th></tr></thead><tbody>{rows.map((row) => { const article = (locale === "sq" ? row.sq : row.en) || row.en || row.sq; const screenshotCount = article?.blocks.filter((block) => block.type === "screenshot" && Boolean(block.src)).length || 0; const hasScreenshot = article?.blocks.some((block) => block.type === "screenshot") || false; const rowStatus = row.en?.status === "CURRENT" && row.sq?.status === "CURRENT" ? "CURRENT" : row.en?.status || row.sq?.status || "MISSING"; return <tr key={row.featureId}><td><strong>{row.title}</strong><small>{row.featureId}</small></td><td>{row.web ? <span className="health-check"><CheckCircle2 size={15} />{labels.web}</span> : "—"}</td><td>{row.mobile ? <span className="health-check"><CheckCircle2 size={15} />{labels.mobile}</span> : "—"}</td><td>{row.en ? <span className="health-check"><CheckCircle2 size={15} />{labels.english}</span> : "—"}</td><td>{row.sq ? <span className="health-check"><CheckCircle2 size={15} />{labels.albanian}</span> : "—"}</td><td>{hasScreenshot ? `${screenshotCount ? `${screenshotCount} captured` : "pending"}` : "—"}</td><td><span className={`health-status health-status-${rowStatus.toLowerCase()}`}>{rowStatus.replaceAll("_", " ")}</span>{article ? <Link href={articlePath(locale, article)}>{labels.open}</Link> : null}</td></tr>; })}</tbody></table></div></section></div></main>;
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string | number; detail: string }) {
  return <article className="invoice-health-metric"><span>{icon}</span><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>;
}
