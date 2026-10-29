import type { Article, DocBlock, Locale, Platform, ProductKey, ScreenshotBlock } from "./types";

/** A value written once per language. */
export type L10n<T> = { en: T; sq: T };

/** Block builders so guides read as plain content. */
export const b = {
  h2: (id: string, text: string): DocBlock => ({ type: "heading", id, text, level: 2 }),
  h3: (id: string, text: string): DocBlock => ({ type: "heading", id, text, level: 3 }),
  p: (text: string): DocBlock => ({ type: "paragraph", text }),
  ul: (items: string[]): DocBlock => ({ type: "list", items }),
  ol: (items: string[]): DocBlock => ({ type: "list", items, ordered: true }),
  steps: (items: Array<{ title: string; text?: string }>, title?: string): DocBlock => ({ type: "steps", title, items }),
  tip: (text: string, title?: string): DocBlock => ({ type: "callout", tone: "tip", text, title }),
  note: (text: string, title?: string): DocBlock => ({ type: "callout", tone: "note", text, title }),
  warn: (text: string, title?: string): DocBlock => ({ type: "callout", tone: "warning", text, title }),
  danger: (text: string, title?: string): DocBlock => ({ type: "callout", tone: "danger", text, title }),
  callout: (tone: "tip" | "note" | "warning" | "danger", text: string, title?: string): DocBlock => ({ type: "callout", tone, text, title }),
  table: (headers: string[], rows: string[][]): DocBlock => ({ type: "table", headers, rows }),
  code: (language: string, code: string, filename?: string): DocBlock => ({ type: "code", language, code, filename }),
  tabs: (tabs: Array<{ label: string; language?: string; code: string }>): DocBlock => ({ type: "tabs", tabs }),
  faq: (items: Array<{ question: string; answer: string }>): DocBlock => ({ type: "accordion", items }),
  link: (title: string, description: string, href: string): DocBlock => ({ type: "link-card", title, description, href }),
  shot: (input: Omit<ScreenshotBlock, "type">): DocBlock => ({ type: "screenshot", ...input }),
};

export interface GuideInput {
  /** Stable id for the English article. The Albanian article is `${id}-sq`. Also used as the translation id. */
  id: string;
  product: ProductKey;
  /** A category slug that exists for the product in products.ts. */
  category: string;
  slug: string;
  /** Unique within product + category. Guides use 1000 and above so they never collide with generated articles. */
  order: number;
  title: L10n<string>;
  description: L10n<string>;
  blocks: L10n<DocBlock[]>;
  tags?: L10n<string[]>;
  keywords?: L10n<string[]>;
  platforms?: Platform[];
  /** "web" or "mobile" when the guide is specific to one platform; omit for both. */
  platform?: "web" | "mobile";
  /** Links the guide to the Web/Mobile equivalent in the platform switcher (registry feature id such as invoice.pos). */
  featureId?: string;
  featured?: boolean;
  readingTime?: string;
  /** English article ids. */
  related?: string[];
  lastUpdated?: string;
}

const DEFAULT_UPDATED = "2026-10-29";

/** Builds the English and Albanian article for one guide. */
export function guide(input: GuideInput): Article[] {
  return (["en", "sq"] as Locale[]).map((locale) => ({
    id: locale === "en" ? input.id : `${input.id}-sq`,
    translationId: input.id,
    locale,
    title: input.title[locale],
    description: input.description[locale],
    product: input.product,
    category: input.category,
    slug: input.slug,
    order: input.order,
    tags: input.tags?.[locale] ?? [],
    keywords: input.keywords?.[locale] ?? [],
    lastUpdated: input.lastUpdated ?? DEFAULT_UPDATED,
    readingTime: input.readingTime ?? "4 min",
    draft: false,
    featured: input.featured,
    platforms: input.platforms,
    platform: input.platform,
    featureId: input.featureId,
    status: "CURRENT",
    blocks: input.blocks[locale],
    related: input.related,
  }));
}

export const guides = (inputs: GuideInput[]) => inputs.flatMap(guide);
