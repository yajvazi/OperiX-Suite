# Publishing the open-source web app

The private monorepo stays the source of truth (web app, mobile app, other products).
The public repo is **generated** from it: web app + the 12 shared packages it needs, with
a fresh single-commit history. The mobile app and other products are never copied.

## Generate and verify

```sh
node scripts/oss/export-web.mjs --out ../operix-invoice-web --force
cd ../operix-invoice-web
npm install --legacy-peer-deps
npm run typecheck && npm test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy npm run build
```

The exporter uses an allowlist, fails if it finds secrets or private identifiers
(Apple team ID, bundle IDs, customer names, your Supabase hosts), and never pushes.
`--init-git` creates a local one-commit repository.

## Before the first public push (not done yet)

- [ ] Choose a license, add `LICENSE`, and decide on a CLA/DCO.
- [ ] Decide the database story: ship all migrations, or a curated invoice-only baseline
      (the migrations currently mix Booking, HR, Desk, CRM and the removed AI tables).
- [ ] Review `note:` lines in the exporter output (links to your public help/marketing pages).
- [ ] Review the README and the POS notice wording.
- [ ] Reserve the OperiX name/logo (trademark policy).

## Hosted deployment

POS and other hosted-only defaults are now environment settings. See
`HOSTED-DEPLOYMENT-ENV.md` **before rebuilding the hosted web image**.
