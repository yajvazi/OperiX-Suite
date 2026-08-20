# OperiX Help Center

The public, documentation-first knowledge base for the entire OperiX Suite. This application replaces the former authenticated helpdesk surface at `helpdesk.operixsuite.com`; it does not contain ticket, inbox, agent, or customer-service management workflows.

## Architecture

- Next.js App Router with React and TypeScript.
- Static/server-rendered pages for the homepage, product/category indexes, articles, FAQs, troubleshooting, API documentation scaffolding, and release notes.
- Typed structured content blocks in `src/content/`. The registry is the single source for article metadata, navigation, and the generated search index.
- English (`/en`) and Albanian (`/sq`) locale routes. If an equivalent Albanian article is not published, the English article is shown with an availability notice.
- Local, generated search index. Search ranking considers exact title, title terms, product/category, tags, descriptions, body text, FAQs, and API sections. The UI talks to `src/lib/search.ts`, so it can later be backed by Postgres FTS, Meilisearch, Typesense, Algolia, or another service without changing the page components.
- No runtime database is required for the initial content-first deployment. Privacy-first analytics hooks emit local browser events for article views, searches, zero-result searches, and helpfulness; connect them to an approved OperiX adapter later. Feedback remains local UI state until an approved, rate-limited endpoint exists.

## Local development

From the monorepo root:

```bash
npm run dev --workspace=operix-help-center
```

The app defaults to `http://localhost:3015`. To use another local port, set `PORT` for the command. The default public origin is `https://helpdesk.operixsuite.com`; override it with `NEXT_PUBLIC_SITE_URL` when testing another host.

## Content structure

The content layer is intentionally dependency-free because the current OperiX monorepo has no MDX toolchain. It uses typed structured blocks instead of a second manually maintained search copy. The `DocBlock` union already covers headings, paragraphs, lists, steps, screenshots, callouts, videos, code, tables, accordions, tabs, link cards, related articles, and previous/next sequencing.

Key files:

- `src/content/types.ts` — metadata and block types.
- `src/content/products.ts` — product/category registry. Adding a product or category automatically updates product pages, sidebars, sitemap, and search.
- `src/content/articles.ts` — starter articles and their blocks.
- `src/content/faqs.ts` — FAQ records and category registry.
- `src/content/troubleshooting.ts` — troubleshooting category registry.
- `src/content/api-docs.ts` — developer/API section registry.
- `src/content/releases.ts` — verified release notes only; it is intentionally empty until release data is supplied.
- `src/content/index.ts` — build-time validation for duplicate routes/orders and unsafe screenshot source paths.

The content model is ready for an MDX adapter later. If MDX is introduced, keep `Article` metadata and the renderer contract stable so navigation/search/SEO do not need to be rewritten.

## How to add an article

1. Add an `Article` object to `src/content/articles.ts` (or a future file-based adapter that produces the same type).
2. Give it a stable `id`, human-readable `title` and `description`, `product`, `category`, `slug`, explicit `order`, tags, keywords, `lastUpdated`, reading time, and `draft` status.
3. Compose the body from the `DocBlock` types. Use local screenshot paths beginning with `/` and never put secrets in code examples.
4. Add `translationId` and a second article with the same translation ID when an Albanian equivalent is ready.
5. Run typecheck, tests, and the documentation validation build. Navigation and search are generated automatically from the registry.

Article URLs are human-readable. Product articles use `/en/help/{product}/{category}/{slug}`. Shared Getting Started articles use `/en/help/getting-started/{slug}`. Albanian uses the equivalent `/sq/...` path.

## Build and validation

```bash
npm run typecheck --workspace=operix-help-center
npm run lint --workspace=operix-help-center
npm test --workspace=operix-help-center
npm run build --workspace=operix-help-center
```

For the browser smoke suite, start the app and run:

```bash
E2E_BASE_URL=http://127.0.0.1:3015 npm run test:e2e --workspace=operix-help-center
```

The production health endpoint is `/api/health` and returns only:

```json
{"status":"ok","service":"operix-help-center"}
```

## Deployment

The production deployment follows the existing OperiX Docker convention. `docker-compose.help-center.yml` builds the standalone app and binds it only to `127.0.0.1:3042`. Nginx should proxy `helpdesk.operixsuite.com` to that port after local health and route tests pass.

Environment variables:

- `PORT` — internal Next.js port; production compose uses `3015`.
- `NEXT_PUBLIC_SITE_URL` — canonical public origin; defaults to `https://helpdesk.operixsuite.com`.
- `NEXT_PUBLIC_SUPPORT_URL` — optional official support destination. If absent, the UI links to the Help Center support configuration page and does not create a fake ticketing flow.
- `INDEXING_ALLOWED` — set to `true` only for production. Staging/development returns a disallow-all robots policy and an empty sitemap.
- `PREVIEW_DRAFTS` — set to `true` only for a private preview build.
- `PREVIEW_AUTHORIZED` — must also be `true` before drafts are included; this is an explicit deployment guard, not an authentication system.

The existing helpdesk must be backed up and left running until the new container is healthy. The Nginx cutover and old-service cleanup procedure is documented in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
