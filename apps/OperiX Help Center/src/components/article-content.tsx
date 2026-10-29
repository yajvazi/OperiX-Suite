import Link from "next/link";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AlertTriangle, Copy, Info, Lightbulb, ExternalLink } from "lucide-react";
import { articlePath, docsPath } from "../lib/paths";
import { copy } from "../content/ui";
import { categoryLabelBySlug } from "../content/i18n";
import type { Article, CalloutBlock, DocBlock, Locale, ScreenshotBlock } from "../content/types";
import { CodeBlockClient, ImageLightbox, TabsClient } from "./article-interactions";

export function ArticleContent({ blocks, locale = "en" }: { blocks: DocBlock[]; locale?: Locale }) {
  return <div className="article-content">{blocks.map((block, index) => <BlockRenderer key={`${block.type}-${index}`} block={block} locale={locale} />)}</div>;
}

function BlockRenderer({ block, locale }: { block: DocBlock; locale: Locale }) {
  if (block.type === "heading") {
    const Heading = block.level === 3 ? "h3" : "h2";
    return <Heading id={block.id}>{block.text}</Heading>;
  }
  if (block.type === "paragraph") return <p>{linkifyText(block.text)}</p>;
  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul";
    return <List>{block.items.map((item) => <li key={item}>{linkifyText(item)}</li>)}</List>;
  }
  if (block.type === "callout") return <Callout block={block} locale={locale} />;
  if (block.type === "steps") return <section className="steps-block" id={block.id}>{block.title ? <h2>{block.title}</h2> : null}<ol className="steps-list">{block.items.map((item, index) => <li key={`${index}-${item.title}`}><span className="step-number">{index + 1}</span><div><strong>{item.title}</strong>{item.text ? <p>{item.text}</p> : null}{item.screenshot ? <Screenshot block={item.screenshot} locale={locale} /> : null}</div></li>)}</ol></section>;
  if (block.type === "screenshot") return <Screenshot block={block} locale={locale} />;
  if (block.type === "video") return <div className="video-placeholder"><span>Video guide</span><strong>{block.title}</strong><small>{block.provider} embed is ready for a verified URL.</small></div>;
  if (block.type === "code") return <CodeBlockClient locale={locale} {...block} />;
  if (block.type === "table") return <div className="table-scroll"><table><thead><tr>{block.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div>;
  if (block.type === "accordion") return <div className="article-accordion">{block.items.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>;
  if (block.type === "tabs") return <TabsClient locale={locale} tabs={block.tabs} />;
  if (block.type === "link-card") return <Link className="article-link-card" href={block.href}><span><strong>{block.title}</strong><small>{block.description}</small></span><ExternalLink size={16} /></Link>;
  return null;
}

function Callout({ block, locale }: { block: CalloutBlock; locale: Locale }) {
  const toneLabel = copy(locale, block.tone === "tip" ? "calloutTip" : block.tone === "note" ? "calloutNote" : block.tone === "warning" ? "calloutWarning" : "calloutDanger");
  const Icon = block.tone === "tip" ? Lightbulb : block.tone === "note" ? Info : AlertTriangle;
  return <aside className={`callout callout-${block.tone}`}><Icon size={18} /><div><strong>{block.title ?? toneLabel}</strong><p>{block.text}</p></div></aside>;
}

function Screenshot({ block, locale }: { block: ScreenshotBlock; locale: Locale }) {
  const annotations = block.annotations?.length ? <ol className="screenshot-annotations" aria-label={copy(locale, "screenshotAnnotations")}>{block.annotations.map((annotation) => <li key={annotation.number}><span aria-hidden="true">{annotation.number}</span><div><strong>{annotation.label}</strong><p>{annotation.description}</p></div></li>)}</ol> : null;
  const generatedSrc = block.screenshotId ? `/screenshots/booking/${block.screenshotId}.png` : undefined;
  const generatedFileExists = generatedSrc ? existsSync(resolve(process.cwd(), "public", generatedSrc.slice(1))) : false;
  const src = block.src ?? (generatedFileExists ? generatedSrc : undefined);
  if (!src) return <div className="screenshot-guide"><figure className={`screenshot-placeholder ${block.mobile ? "is-mobile" : ""}`} aria-label={block.alt}><div><span className="placeholder-image-icon"><Copy size={24} /></span><strong>Screenshot pending capture</strong><small>Screenshot placeholder until an approved non-production application or simulator capture is available.</small></div><figcaption>{block.caption}{block.screenshotId ? <small className="screenshot-id">Screenshot ID: {block.screenshotId}</small> : null}</figcaption></figure>{annotations}</div>;
  return <div className="screenshot-guide"><ImageLightbox locale={locale} src={src} alt={block.alt} caption={block.caption} mobile={block.mobile} />{annotations}</div>;
}

function linkifyText(text: string) {
  const parts = text.split(/(`[^`]+`|\[[^\]]+\]\([^\)]+\))/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) return link[2].startsWith("/") ? <Link key={index} href={link[2]}>{link[1]}</Link> : <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <span key={index}>{part}</span>;
  });
}

export function ArticleHeader({ article, productName, productIcon: _productIcon, locale, isFallback, platformAlternatives = [], displayPlatform }: { article: Article; productName: string; productIcon: React.ReactNode; locale: Locale; isFallback: boolean; platformAlternatives?: Article[]; displayPlatform?: "web" | "mobile" }) {
  const platformOptions = article.product === "booking" && article.platform !== "web" && article.platform !== "mobile" ? (["web", "mobile"] as const) : article.platform === "web" || article.platform === "mobile" ? ([article.platform] as const) : [];
  const invoicePlatformAlternatives = article.product === "invoice" ? platformAlternatives.filter((alternative) => alternative.platforms?.[0] === "web" || alternative.platforms?.[0] === "mobile") : [];
  return <>
    {isFallback ? <div className="translation-notice" role="status">{locale === "sq" ? "Ky artikull është aktualisht i disponueshëm vetëm në anglisht. Po shihni versionin e disponueshëm." : "This article is currently available in English. You are viewing the available version."}</div> : null}
    <nav className="article-breadcrumb" aria-label={copy(locale, "breadcrumb")}><Link href={`/${locale}`}>{copy(locale, "helpCenter")}</Link><span>/</span><Link href={docsPath(locale, article.product)}>{productName}</Link><span>/</span><Link href={docsPath(locale, article.product, article.category, undefined, displayPlatform)}>{categoryLabelBySlug(locale, article.category, article.category.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()))}</Link><span>/</span><strong>{article.title}</strong></nav>
    <div className="article-heading"><div className="article-product-mark">{_productIcon}</div><div><p className="article-product-name">{productName}</p><h1>{article.title}</h1><p className="article-description">{article.description}</p><div className="article-meta"><span>{copy(locale, "lastUpdated")}: {new Intl.DateTimeFormat(locale === "sq" ? "sq-AL" : "en-US", { month: "short", year: "numeric" }).format(new Date(`${article.lastUpdated}T12:00:00Z`))}</span><span aria-hidden="true">·</span><span>{article.readingTime} {copy(locale, "read")}</span>{article.documentationStatus && article.documentationStatus !== "CURRENT" ? <><span aria-hidden="true">·</span><span className={`article-status article-status-${article.documentationStatus.toLowerCase()}`}>{article.documentationStatus.replaceAll("_", " ")}</span></> : null}</div>{invoicePlatformAlternatives.length > 1 ? <nav className="platform-switcher" aria-label={locale === "sq" ? "Platforma" : "Platform"}><span>{locale === "sq" ? "Platforma:" : "Platform:"}</span>{invoicePlatformAlternatives.map((alternative) => <Link key={alternative.id} className={alternative.id === article.id ? "is-active" : ""} href={articlePath(locale, alternative)}>{alternative.platforms?.[0] === "mobile" ? "Mobile" : "Web"}</Link>)}</nav> : platformOptions.length ? <nav className="platform-switcher" aria-label={locale === "sq" ? "Platforma" : "Platform"}><span>{locale === "sq" ? "Platforma:" : "Platform:"}</span>{platformOptions.map((platform) => <Link key={platform} className={(displayPlatform ?? article.platform) === platform ? "is-active" : ""} href={docsPath(locale, article.product, article.category, article.slug, platform)}>{platform === "mobile" ? "Mobile" : "Web"}</Link>)}</nav> : null}{article.requiredPermissions?.length ? <p className="article-permissions"><strong>{locale === "sq" ? "Qasja:" : "Access:"}</strong> {locale === "sq" ? "Disa veprime kërkojnë leje të rolit." : "Some actions require role permissions."}</p> : null}</div></div>
  </>;
}

export function RelatedArticles({ articles, locale, label }: { articles: Article[]; locale: "en" | "sq"; label: string }) {
  if (!articles.length) return null;
  return <section className="related-articles"><h2>{label}</h2><div className="related-list">{articles.map((article) => <Link href={articlePath(locale, article)} key={article.id}>{article.title}<ExternalLink size={14} /></Link>)}</div></section>;
}

export function PreviousNext({ previous, next, locale, labels }: { previous?: Article; next?: Article; locale: "en" | "sq"; labels: { previous: string; next: string } }) {
  return <nav className="previous-next" aria-label={copy(locale, "articleSequence")}>
    {previous ? <Link href={articlePath(locale, previous)}><span><small>← {labels.previous}</small><strong>{previous.title}</strong></span></Link> : <span />}
    {next ? <Link className="next" href={articlePath(locale, next)}><span><small>{labels.next} →</small><strong>{next.title}</strong></span></Link> : <span />}
  </nav>;
}
