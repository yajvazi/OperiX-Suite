import { apiSections } from "../content/api-docs";
import { articles, getPublishedArticles } from "../content/articles";
import { getFaqs } from "../content/faqs";
import { getCategory, productDefinitions } from "../content/products";
import type { Locale, ProductKey } from "../content/types";
import { apiPath, articlePath, docsPath, faqPath } from "./paths";

export type SearchEntryKind = "article" | "faq" | "category" | "api";

export interface SearchEntry {
  id: string;
  kind: SearchEntryKind;
  locale: Locale;
  title: string;
  description: string;
  body: string;
  product?: ProductKey;
  productName?: string;
  category?: string;
  tags: string[];
  href: string;
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function blocksToText(article: (typeof articles)[number]) {
  return article.blocks.map((block) => {
    if ("text" in block) return block.text;
    if (block.type === "list") return block.items.join(" ");
    if (block.type === "steps") return block.items.map((item) => `${item.title} ${item.text ?? ""}`).join(" ");
    if (block.type === "table") return [...block.headers, ...block.rows.flat()].join(" ");
    if (block.type === "accordion") return block.items.map((item) => `${item.question} ${item.answer}`).join(" ");
    if (block.type === "tabs") return block.tabs.map((tab) => `${tab.label} ${tab.code}`).join(" ");
    if (block.type === "link-card") return `${block.title} ${block.description}`;
    return "";
  }).join(" ");
}

function buildIndex(locale: Locale): SearchEntry[] {
  const result: SearchEntry[] = [];
  for (const article of getPublishedArticles(locale)) {
    const product = productDefinitions.find((item) => item.key === article.product);
    const category = getCategory(product!, article.category);
    result.push({
      id: `${article.locale}:article:${article.id}`,
      kind: "article",
      locale: article.locale,
      title: article.title,
      description: article.description,
      body: blocksToText(article),
      product: article.product,
      productName: product?.name,
      category: category?.name,
      tags: [...article.tags, ...article.keywords],
      href: articlePath(locale, article),
    });
  }
  for (const product of productDefinitions) {
    for (const category of product.categories) {
      result.push({
        id: `${locale}:category:${product.key}:${category.slug}`,
        kind: "category",
        locale,
        title: category.name,
        description: category.description ?? `Browse ${category.name} documentation in ${product.name}.`,
        body: `${product.name} ${category.name} documentation coming soon`,
        product: product.key,
        productName: product.name,
        category: category.name,
        tags: [product.name, category.name],
        href: docsPath(locale, product.key, category.slug),
      });
    }
  }
  for (const faq of getFaqs(locale)) {
    result.push({
      id: `${faq.locale}:faq:${faq.id}`,
      kind: "faq",
      locale: faq.locale,
      title: faq.question,
      description: faq.answer,
      body: `${faq.question} ${faq.answer} ${faq.category}`,
      category: faq.category,
      tags: ["faq", faq.category],
      href: `${faqPath(locale)}#${faq.id}`,
    });
  }
  for (const section of apiSections) {
    result.push({
      id: `${locale}:api:${section.slug}`,
      kind: "api",
      locale,
      title: section.title,
      description: section.description,
      body: `${section.title} ${section.description} API developers webhooks code examples`,
      tags: ["api", "developers", section.title],
      href: apiPath(locale, section.slug),
    });
  }
  return result;
}

export const searchIndexes: Record<Locale, SearchEntry[]> = {
  en: buildIndex("en"),
  sq: buildIndex("sq"),
};

function scoreEntry(entry: SearchEntry, query: string) {
  const normalizedQuery = normalize(query);
  const title = normalize(entry.title);
  const description = normalize(entry.description);
  const body = normalize(entry.body);
  const tags = normalize(entry.tags.join(" "));
  let score = 0;
  if (title === normalizedQuery) score += 120;
  if (title.startsWith(normalizedQuery)) score += 80;
  if (title.includes(normalizedQuery)) score += 45;
  if (tags.includes(normalizedQuery)) score += 25;
  if (description.includes(normalizedQuery)) score += 18;
  if (body.includes(normalizedQuery)) score += 10;
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  for (const term of terms) {
    if (title.includes(term)) score += 24;
    if (tags.includes(term)) score += 12;
    if (description.includes(term)) score += 8;
    if (body.includes(term)) score += 4;
  }
  if (entry.kind === "article") score += 3;
  return score;
}

export function searchDocumentation(query: string, locale: Locale, product?: ProductKey) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return searchIndexes[locale]
    .filter((entry) => !product || entry.product === product)
    .map((entry) => ({ entry, score: scoreEntry(entry, trimmed) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .map((result) => result.entry)
    .slice(0, 50);
}

export function popularSearchEntries(locale: Locale) {
  const preferred = ["welcome-to-operix", "create-an-invoice", "about-operix-hr", "about-operix-booking", "about-operix-desk", "about-operix-control"];
  return preferred.map((id) => searchIndexes[locale].find((entry) => entry.id.endsWith(`:article:${id}`))).filter(Boolean) as SearchEntry[];
}

export function highlightText(value: string, query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return [{ text: value, match: false }];
  const matcher = new RegExp(`(${terms.join("|")})`, "gi");
  return value.split(matcher).filter(Boolean).map((text) => ({ text, match: terms.some((term) => new RegExp(`^${term}$`, "i").test(text)) }));
}
