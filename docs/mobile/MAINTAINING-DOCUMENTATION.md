# Maintaining mobile documentation

The Markdown files under `docs/mobile/en/` and `docs/mobile/sq/` are the canonical user documentation. The mobile app does not contain a manually copied second version of article text.

## Architecture

```text
docs/mobile/en + docs/mobile/sq
        │
        ├── scripts/generate-mobile-docs.mjs
        │       ├── validates frontmatter and language pairs
        │       ├── resolves internal article links
        │       └── generates a bundled TypeScript asset
        │
        └── apps/OperiX Invoice/OperiX Invoice Mobile/src/generated/mobileDocs.ts
                │
                └── native Help & Support home → category → article screens
```

The generated asset is bundled with the Expo app, so core help content is available without an internet connection. It is generated output and must not be edited by hand.

## Create an article

1. Add an English Markdown file below `docs/mobile/en/<category>/`.
2. Start it with the required frontmatter:

   ```yaml
   ---
   title: Create an invoice
   description: Learn how to create an invoice in OperiX Invoice Mobile.
   category: invoices
   language: en
   keywords:
     - invoice
     - create invoice
     - billing
   ---
   ```

3. Add the same logical path below `docs/mobile/sq/` with native Albanian content and `language: sq`.
4. Keep the article grounded in the current source code. If the feature is partial/disabled, say so in the article and add a status override in `docs/mobile/article-metadata.json` when the Help Center badge should reflect it.

The generator derives the logical ID from the path. `invoices/create-and-edit.md` therefore has the same ID in both languages: `invoices/create-and-edit`. `README.md` at the language root becomes `mobile-guide`; a category `README.md` becomes the category ID, such as `faq`.

## Metadata and categories

Frontmatter supplies title, description, category, language, and keywords. Optional `status`, `introducedIn`, `updatedIn`, and `updatedAt` values are carried into the generated index. Do not invent versions; leave version fields absent/null unless the repository has an actual version.

`docs/mobile/article-metadata.json` contains app metadata, the category registry/order/icons, popular article IDs, status overrides, and related-article IDs. Add a category there only when the corresponding user documentation category exists in both languages. The generator rejects unused categories, missing categories, duplicate IDs, and missing pairs.

## Related articles and popular articles

Add logical IDs to `relatedArticles` in `article-metadata.json`. Every target must exist. Add commonly used logical IDs to `popular`. The mobile UI uses the generated metadata and does not hardcode article text or duplicate article content.

## How content reaches the app

From the repository root:

```bash
npm run docs:mobile:generate
```

This validates the Markdown and writes `apps/OperiX Invoice/OperiX Invoice Mobile/src/generated/mobileDocs.ts`. The app imports that generated file and renders it with a small native Markdown renderer. Since the asset is bundled, article reading/search/category navigation works offline.

## Search indexing

The app indexes each localized article’s title, description, keywords, category label, and Markdown content at runtime. Title matches receive the highest score, followed by description, keywords/category, and body matches. Search uses the selected documentation language and updates locally without a network request.

## Verify changes

Run:

```bash
npm run docs:mobile:validate
npm run docs:mobile:generate
npm --prefix "apps/OperiX Invoice/OperiX Invoice Mobile" run typecheck
npm --prefix "apps/OperiX Invoice/OperiX Invoice Mobile" run test
npm --prefix "apps/OperiX Invoice/OperiX Invoice Mobile" run build:check
```

The generated file should be regenerated whenever Markdown changes. Use `git diff --check` before review. The app’s existing localization check remains separate from documentation parity.

## Screenshots

Do not put fake screenshots in the Markdown. Add a `> Screenshot: ...` placeholder when visual help would be useful and add the screen to `docs/mobile/SCREENSHOT-PLAN.md`. A later screenshot implementation can replace the placeholder without changing article IDs.

## Support and future retrieval

Generated articles expose `id`, `language`, `category`, `title`, `description`, `keywords`, `content`, `relatedArticles`, `app`, `status`, `introducedIn`, `updatedIn`, and `updatedAt`. This shape can later feed Help Center, AI/RAG, or support tooling without changing the canonical Markdown source.
