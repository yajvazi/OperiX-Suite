"use client";

import Image from "next/image";
import { Check, Copy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { trackDocsEvent } from "../lib/analytics";

export function CodeBlockClient({ language, code, filename }: { language: string; code: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <div className="code-block"><div className="code-toolbar"><span>{filename ?? language}</span><button type="button" onClick={copyCode} aria-label="Copy code">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button></div><pre><code data-language={language}>{code}</code></pre></div>;
}

export function TabsClient({ tabs }: { tabs: Array<{ label: string; language?: string; code: string }> }) {
  const [active, setActive] = useState(0);
  return <div className="code-tabs"><div role="tablist" aria-label="Code examples">{tabs.map((tab, index) => <button type="button" role="tab" aria-selected={active === index} className={active === index ? "is-active" : ""} key={tab.label} onClick={() => setActive(index)}>{tab.label}</button>)}</div><CodeBlockClient language={tabs[active].language ?? tabs[active].label} code={tabs[active].code} /></div>;
}

export function ImageLightbox({ src, alt, caption, mobile }: { src: string; alt: string; caption: string; mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return <figure className={`article-screenshot ${mobile ? "is-mobile" : ""}`}><button type="button" onClick={() => setOpen(true)} aria-label={`Expand screenshot: ${alt}`}><Image src={src} alt={alt} width={1600} height={900} loading="lazy" /></button><figcaption>{caption}</figcaption>{open ? <div className="lightbox-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="lightbox-dialog" role="dialog" aria-modal="true" aria-label={alt}><button type="button" className="lightbox-close icon-button" onClick={() => setOpen(false)} aria-label="Close image"><X size={20} /></button><Image src={src} alt={alt} width={1600} height={900} sizes="100vw" /></div></div> : null}</figure>;
}

export function ArticleFeedback({ articleId, labels }: { articleId?: string; labels: { question: string; yes: string; no: string } }) {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
  const [sent, setSent] = useState(false);
  return <section className="article-feedback" aria-live="polite"><div><strong>{labels.question}</strong>{sent ? <span className="feedback-thanks">Thanks for helping us improve the docs.</span> : null}</div>{!sent ? <><div className="feedback-actions"><button type="button" aria-label={labels.yes} className={answer === "yes" ? "is-selected" : ""} onClick={() => { setAnswer("yes"); setSent(true); trackDocsEvent({ type: "article_feedback", articleId, helpful: true }); }}><span aria-hidden="true">👍</span>{labels.yes}</button><button type="button" aria-label={labels.no} className={answer === "no" ? "is-selected" : ""} onClick={() => { setAnswer("no"); trackDocsEvent({ type: "article_feedback", articleId, helpful: false }); }}><span aria-hidden="true">👎</span>{labels.no}</button></div>{answer === "no" ? <form className="feedback-form" onSubmit={(event) => { event.preventDefault(); setSent(true); }}><label htmlFor="article-feedback-comment">What could we improve?</label><textarea id="article-feedback-comment" rows={3} placeholder="Tell us what was missing or unclear." /><button type="submit" className="button-secondary">Send Feedback</button></form> : null}</> : null}</section>;
}
