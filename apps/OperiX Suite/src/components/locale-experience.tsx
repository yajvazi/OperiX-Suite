"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { albanianTranslations, type Locale } from "@/content/locales";

const translatedAttributes = ["aria-label", "placeholder", "title"] as const;
const ignoredTextParents = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

function translateTextNode(node: Text) {
  if (!node.parentElement || ignoredTextParents.has(node.parentElement.tagName)) return;
  const raw = node.nodeValue ?? "";
  const trimmed = raw.trim();
  const translated =
    albanianTranslations[trimmed] ??
    (trimmed.startsWith("Document ") ? trimmed.replace("Document", "Dokumenti") : undefined) ??
    (trimmed.startsWith("Team member ") ? trimmed.replace("Team member", "Anëtari i ekipit") : undefined) ??
    (trimmed.startsWith("© ") && trimmed.endsWith("All rights reserved.")
      ? trimmed.replace("All rights reserved.", "Të gjitha të drejtat e rezervuara.")
      : undefined);
  if (!translated) return;
  node.nodeValue = raw.replace(trimmed, translated);
}

function translateElement(element: Element) {
  for (const attribute of translatedAttributes) {
    const value = element.getAttribute(attribute);
    if (value && albanianTranslations[value]) {
      element.setAttribute(attribute, albanianTranslations[value]);
    }
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node as Text);
    node = walker.nextNode();
  }
}

export function LocaleExperience({ locale, children }: { locale: Locale; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    document.documentElement.lang = locale === "al" ? "sq" : "en";
    if (locale !== "al") return;

    translateElement(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target as Text);
          continue;
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
          if (node.nodeType === Node.ELEMENT_NODE) translateElement(node as Element);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [locale, pathname]);

  useEffect(() => {
    function preserveLocale(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const target = event.target as Element | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || /^\/(en|al)(\/|$)/.test(url.pathname)) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      event.preventDefault();
      const localizedPath = url.pathname === "/" ? `/${locale}` : `/${locale}${url.pathname}`;
      router.push(`${localizedPath}${url.search}${url.hash}`);
    }

    document.addEventListener("click", preserveLocale, true);
    return () => document.removeEventListener("click", preserveLocale, true);
  }, [locale, router]);

  return children;
}
