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

## Building and deploying the hosted web image

The hosted image is built from the generated tree (not from the monorepo root, whose
lockfile mixes every product):

```sh
scripts/oss/build-web-image.sh                                   # exports, copies .env.production, docker build
docker compose -f docker-compose.web.yml -p operix up -d --no-build operix-web
```

Roll back with `docker tag operix-invoice-web:rollback-<date> operix-invoice-web:latest` and
the same `up -d --no-build` command. Tag the running image before every deploy.

The generated tree installs with `deploy/web-oss/package-lock.json` (copied in by the exporter).

### Regenerating that lockfile

Needed when the web app's or a shared package's dependencies change. To keep every existing
version, seed from the monorepo lock, strip workspaces that are not in the tree, drop the web
app's nested `node_modules` entries so `react` is hoisted, then let npm prune:

1. Export to a scratch folder and copy `package-lock.json` (monorepo root) over its lock.
2. Delete lock entries for every workspace outside the exported set, their link entries, the
   stale `apps/OperiX Invoice` entry and everything under `apps/OperiX Invoice/OperiX Web/node_modules/`.
3. `npm install --package-lock-only --legacy-peer-deps`, copy the result to `deploy/web-oss/`.
4. Verify in the scratch folder: `npm ci`, `npm run typecheck`, `npm test`, and a production
   build with the hosted env file.

A fresh `npm install` (no seed) also works but upgrades dependency versions.
