import Link from "next/link";
import { AlertTriangle, Copy, Info, Lightbulb, ExternalLink } from "lucide-react";
import { articlePath } from "../lib/paths";
import type { Article, CalloutBlock, DocBlock, ScreenshotBlock } from "../content/types";
import { CodeBlockClient, ImageLightbox, TabsClient } from "./article-interactions";

export function ArticleContent({ blocks }: { blocks: DocBlock[] }) {
  return <div className="article-content">{blocks.map((block, index) => <BlockRenderer key={`${block.type}-${index}`} block={block} />)}</div>;
}

function BlockRenderer({ block }: { block: DocBlock }) {
  if (block.type === "heading") {
    const Heading = block.level === 3 ? "h3" : "h2";
    return <Heading id={block.id}>{block.text}</Heading>;
  }
  if (block.type === "paragraph") return <p>{linkifyText(block.text)}</p>;
  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul";
    return <List>{block.items.map((item) => <li key={item}>{linkifyText(item)}</li>)}</List>;
  }
  if (block.type === "callout") return <Callout block={block} />;
  if (block.type === "steps") return <section className="steps-block" id={block.id}>{block.title ? <h2>{block.title}</h2> : null}<ol className="steps-list">{block.items.map((item, index) => <li key={`${index}-${item.title}`}><span className="step-number">{index + 1}</span><div><strong>{item.title}</strong>{item.text ? <p>{item.text}</p> : null}{item.screenshot ? <Screenshot block={item.screenshot} /> : null}</div></li>)}</ol></section>;
  if (block.type === "screenshot") return <Screenshot block={block} />;
  if (block.type === "video") return <div className="video-placeholder"><span>Video guide</span><strong>{block.title}</strong><small>{block.provider} embed is ready for a verified URL.</small></div>;
  if (block.type === "code") return <CodeBlockClient {...block} />;
  if (block.type === "table") return <div className="table-scroll"><table><thead><tr>{block.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div>;
  if (block.type === "accordion") return <div className="article-accordion">{block.items.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>;
  if (block.type === "tabs") return <TabsClient tabs={block.tabs} />;
  if (block.type === "link-card") return <Link className="article-link-card" href={block.href}><span><strong>{block.title}</strong><small>{block.description}</small></span><ExternalLink size={16} /></Link>;
  return null;
}

function Callout({ block }: { block: CalloutBlock }) {
  const Icon = block.tone === "tip" ? Lightbulb : block.tone === "note" ? Info : AlertTriangle;
  return <aside className={`callout callout-${block.tone}`}><Icon size={18} /><div><strong>{block.title ?? block.tone.toUpperCase()}</strong><p>{block.text}</p></div></aside>;
}

function Screenshot({ block }: { block: ScreenshotBlock }) {
  if (!block.src) return <figure className={`screenshot-placeholder ${block.mobile ? "is-mobile" : ""}`}><div><span className="placeholder-image-icon"><Copy size={24} /></span><strong>Screenshot placeholder</strong></div><figcaption>{block.caption}</figcaption></figure>;
  return <ImageLightbox src={block.src} alt={block.alt} caption={block.caption} mobile={block.mobile} />;
}

function linkifyText(text: string) {
  return text.split(/(`[^`]+`)/g).map((part, index) => part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : <span key={index}>{part}</span>);
}

export function ArticleHeader({ article, productName, productIcon: _productIcon, locale, isFallback }: { article: Article; productName: string; productIcon: React.ReactNode; locale: "en" | "sq"; isFallback: boolean }) {
  return <>
    {isFallback ? <div className="translation-notice" role="status">This article is currently available in English. You are viewing the available version.</div> : null}
    <nav className="article-breadcrumb" aria-label="Breadcrumb"><Link href={`/${locale}`}>Help Center</Link><span>/</span><Link href={`/${locale}/help/${article.product}`}>{productName}</Link><span>/</span><Link href={`/${locale}/help/${article.product}/${article.category}`}>{article.category.replace(/-/g, " ")}</Link><span>/</span><strong>{article.title}</strong></nav>
    <div className="article-heading"><div className="article-product-mark">{_productIcon}</div><div><p className="article-product-name">{productName}</p><h1>{article.title}</h1><p className="article-description">{article.description}</p><div className="article-meta"><span>Last updated: {new Intl.DateTimeFormat(locale === "sq" ? "sq-AL" : "en-US", { month: "short", year: "numeric" }).format(new Date(`${article.lastUpdated}T12:00:00Z`))}</span><span aria-hidden="true">·</span><span>{article.readingTime} read</span></div></div></div>
  </>;
}

export function RelatedArticles({ articles, locale, label }: { articles: Article[]; locale: "en" | "sq"; label: string }) {
  if (!articles.length) return null;
  return <section className="related-articles"><h2>{label}</h2><div className="related-list">{articles.map((article) => <Link href={articlePath(locale, article)} key={article.id}>{article.title}<ExternalLink size={14} /></Link>)}</div></section>;
}

export function PreviousNext({ previous, next, locale, labels }: { previous?: Article; next?: Article; locale: "en" | "sq"; labels: { previous: string; next: string } }) {
  return <nav className="previous-next" aria-label="Article sequence">
    {previous ? <Link href={articlePath(locale, previous)}><span><small>← {labels.previous}</small><strong>{previous.title}</strong></span></Link> : <span />}
    {next ? <Link className="next" href={articlePath(locale, next)}><span><small>{labels.next} →</small><strong>{next.title}</strong></span></Link> : <span />}
  </nav>;
}
