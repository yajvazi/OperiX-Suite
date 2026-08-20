# OperiX Help Center content guide

This Help Center is content-first. Article metadata, navigation, and search are generated from one typed content registry.

## Required metadata

Every article needs:

```ts
{
  id: "create-an-invoice",
  translationId: "create-an-invoice",
  locale: "en",
  title: "Create an Invoice",
  description: "Learn how to create, send and manage invoices using OperiX Invoice.",
  product: "invoice",
  category: "invoices",
  slug: "create-invoice",
  order: 1,
  tags: ["invoice", "billing"],
  keywords: ["new invoice", "send invoice"],
  lastUpdated: "2026-08-01",
  readingTime: "5 min",
  draft: false,
  blocks: [],
}
```

`id` is an internal stable identifier. `slug` is used in the URL. `product` and `category` must exist in `src/content/products.ts`. `order` is explicit and must be unique within a locale/product/category sequence.

## Routes and navigation

- Product home: `/en/help/invoice`
- Category home: `/en/help/invoice/invoices`
- Article: `/en/help/invoice/invoices/create-invoice`
- Shared Getting Started: `/en/help/getting-started/welcome-to-operix`
- Albanian equivalent: replace `/en` with `/sq`.

Do not edit sidebar files when adding an article. The sidebar reads category metadata and article order from the registry. Product additions work the same way: add one `ProductDefinition`, its categories, and its content.

## Content blocks

Use the block union in `src/content/types.ts`:

- `heading` — add a stable lowercase `id`; headings populate the “On this page” table of contents.
- `paragraph` — regular article copy. Wrap inline code in backticks.
- `list` — unordered or ordered lists.
- `callout` — `tip`, `note`, `warning`, or `danger`.
- `steps` — numbered how-to steps. A step can include a screenshot block.
- `screenshot` — use a local `/images/...` path when available; without `src`, the production placeholder makes the missing asset visible.
- `video` — only add a verified YouTube, Vimeo, or self-hosted URL; never add fake embeds.
- `code` and `tabs` — use obvious placeholders until the API contract is public. Never use real API keys, tokens, database URLs, or production identifiers.
- `table`, `accordion`, and `link-card` — use for structured reference material.

Screenshots are lazy-loaded and open in a keyboard-closeable lightbox. Keep source images optimized and use accurate alt text and captions. Mobile screenshots can set `mobile: true`.

## Drafts and preview

Set `draft: true` while content is under review. Drafts are excluded from production navigation, search, sitemap, and public routes. Development or an authorized preview deployment can set both `PREVIEW_DRAFTS=true` and `PREVIEW_AUTHORIZED=true`; keep that deployment private and prevent indexing. `PREVIEW_DRAFTS` alone never exposes drafts.

## Albanian translations

Create a second article with the same `translationId`, `locale: "sq"`, and equivalent `product`, `category`, and `slug`. Translate the title, description, blocks, tags, and keywords. The language switcher keeps the equivalent path. When a translation is not available, the English article is shown with a clear notice.

UI labels live in `src/content/ui.ts`. Add locale labels there rather than scattering translated strings through components.

## Search and SEO

The search index is derived from article metadata and body blocks. Add meaningful tags/keywords because they improve discovery, but do not repeat content solely for search. Article titles/descriptions feed page metadata, Open Graph, JSON-LD, and the sitemap.

Build-time validation fails on duplicate article routes, duplicate navigation order, unknown categories, missing required metadata, duplicate heading IDs, missing local screenshot files, missing related articles, invalid link-card URLs, and non-local screenshot paths. Keep internal links expressed through the helpers in `src/lib/paths.ts` where possible.

## Authoring checklist

- Verify the product/category and route.
- Use a meaningful title and description.
- Add `lastUpdated`, reading time, tags, keywords, and order.
- Mark unfinished content as `draft: true`.
- Use screenshots with accurate alt text and captions.
- Use callouts for important caveats, not decoration.
- Use ordered steps for procedures.
- Use placeholders in all code examples.
- Add or update an Albanian equivalent when translation is available.
- Run `typecheck`, `lint`, `test`, and `build` before publishing.
