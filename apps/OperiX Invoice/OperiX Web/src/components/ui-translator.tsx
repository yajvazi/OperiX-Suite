"use client";

import { useEffect } from "react";
import { getUiLanguage } from "@/lib/i18n/language";
import { createTranslator, type Translator } from "@/lib/i18n/translator";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT"]);
// Invoice documents follow the language chosen for the invoice itself, not the language of the app.
const SKIP_SELECTOR = "[data-no-translate], [contenteditable='true'], .document-scale-frame, .invoice-template-preview, .receipt-doc, .invoice-doc";
const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];

// React marks every DOM node it owns with a "__reactFiber$…" property. Server HTML that React has not hydrated yet has none,
// and changing its text would make hydration throw that HTML away and render it again. Such parts are translated once React owns them.
function hydrated(element: Element): boolean {
  for (const key in element) if (key.startsWith("__reactFiber$")) return true;
  return false;
}

function skipped(element: Element | null): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) if (SKIP_TAGS.has(node.tagName)) return true;
  return Boolean(element?.closest(SKIP_SELECTOR));
}

function translateText(text: Text, translator: Translator) {
  const next = translator.translate(text.data);
  if (next !== null) text.data = next;
}

function translateElement(element: Element, translator: Translator) {
  if (SKIP_TAGS.has(element.tagName)) return;
  if (element.matches(SKIP_SELECTOR)) return;
  if (!hydrated(element)) return;
  for (const attribute of ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) { const next = translator.translate(value); if (next !== null) element.setAttribute(attribute, next); }
  }
  if (element.tagName === "INPUT") {
    const input = element as HTMLInputElement;
    if (["button", "submit"].includes(input.type) && input.value) { const next = translator.translate(input.value); if (next !== null) input.value = next; }
    return;
  }
  element.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) translateText(child as Text, translator);
    else if (child.nodeType === Node.ELEMENT_NODE) translateElement(child as Element, translator);
  });
}

/** Translates a node that was added or changed, unless it sits inside text that must stay as written. */
function translateTree(root: Node, translator: Translator) {
  if (root.nodeType === Node.TEXT_NODE) {
    const text = root as Text;
    if (text.parentElement && hydrated(text.parentElement) && !skipped(text.parentElement)) translateText(text, translator);
  } else if (root.nodeType === Node.ELEMENT_NODE && !skipped(root as Element)) translateElement(root as Element, translator);
}

/** Translates the interface into Albanian when that language is chosen, and keeps doing so as the page changes. */
export function UiTranslator() {
  useEffect(() => {
    if (getUiLanguage() !== "sq") return;
    document.documentElement.lang = "sq";
    let observer: MutationObserver | null = null;
    let cancelled = false;
    let sweepTimer = 0;
    // Changing text while React is still attaching to the server HTML makes it discard that HTML, so wait until the page is settled.
    const settled = new Promise<void>((resolve) => {
      const done = () => window.setTimeout(resolve, 250);
      if (document.readyState === "complete") done(); else window.addEventListener("load", done, { once: true });
    });
    void Promise.all([import("@/lib/i18n/sq-dictionary"), settled]).then(([{ SQ_DICTIONARY }]) => {
      if (cancelled) return;
      const translator = createTranslator(SQ_DICTIONARY);
      const watch = () => observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
      const run = () => { observer?.disconnect(); try { translateTree(document.body, translator); } finally { watch(); } };
      run();
      // Parts of the page that React hydrates later change no DOM when they become ready, so look again for a while.
      let sweeps = 0;
      sweepTimer = window.setInterval(() => { run(); if (++sweeps >= 20) window.clearInterval(sweepTimer); }, 750);
      const title = translator.translate(document.title);
      if (title !== null) document.title = title;
      observer = new MutationObserver((records) => {
        observer?.disconnect();
        try {
          for (const record of records) {
            if (record.type === "characterData") translateTree(record.target, translator);
            else if (record.type === "attributes") { if (record.target.nodeType === Node.ELEMENT_NODE) translateTree(record.target, translator); }
            else record.addedNodes.forEach((added) => translateTree(added, translator));
          }
        } finally {
          observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
    });
    return () => { cancelled = true; window.clearInterval(sweepTimer); observer?.disconnect(); };
  }, []);
  return null;
}
