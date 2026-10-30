# OperiX Invoice (web)

Open-source invoicing and accounting for small and medium businesses: invoices, quotes, delivery
notes and credit notes, customers and products, expenses and vendor bills, payments, double-entry
accounting, VAT and tax reports, payroll, a point of sale, a customer portal, and a public API.
English and Albanian (Shqip).

You can run it on your own server and connect the **OperiX Invoice mobile app** (App Store / Google Play)
to it by scanning a QR code.

> **Licence:** [GNU AGPL-3.0](LICENSE). If you run a modified version as a network service, you must
> offer your users the source of your modifications. See [Licence](#licence).

## Contents

- [Important notices](#important-notices)
- [How it fits together](#how-it-fits-together)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [1. Create the backend (Supabase)](#1-create-the-backend-supabase)
- [2. Set up the database](#2-set-up-the-database)
- [3. Configure the app](#3-configure-the-app)
- [4. Run it](#4-run-it)
- [5. First sign-in](#5-first-sign-in)
- [Connect the mobile app](#connect-the-mobile-app)
- [Configuration reference](#configuration-reference)
- [Optional features](#optional-features)
- [Backups and upgrades](#backups-and-upgrades)
- [Security checklist](#security-checklist)
- [Development](#development)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing) · [Security reports](#security-reports) · [Licence](#licence)

## Important notices

- **Not fiscal software.** This edition is for business-to-business invoicing. It is **not** certified
  fiscal software (for example Kosovo's ATK/SEF) and it does not issue fiscal receipts. The point of
  sale is **off by default** (`NEXT_PUBLIC_POS_ENABLED`). Consumer sales in Kosovo must be registered
  through a certified SEF. Check the rules in your country before you enable it.
- **Not tax or legal advice.** Charts of accounts, VAT rules and payroll rules are provided as a
  starting point. Have an accountant review them before you rely on them.
- **You are the operator.** If you host this for other people you are responsible for their data:
  backups, security updates, privacy notices and legal compliance.

## How it fits together

```
 browser / mobile app ──►  Next.js web app  ──►  Supabase (Postgres + Auth + Storage)
                           (this repository)       (your own project or server)
```

- The web app is a [Next.js](https://nextjs.org) application (`apps/OperiX Invoice/OperiX Web`) with shared
  TypeScript packages in `packages/` (money, accounting, invoice templates, report templates, payroll, billing...).
- All business data lives in a **Postgres database** managed through [Supabase](https://supabase.com).
  Access is protected by row-level security: every query runs as the signed-in user.
- Optionally, a workspace can keep its data **in the browser only** (Settings → Data storage → "In this
  browser"), using SQLite in WebAssembly. That mode needs no database for the business data.
- PDFs are rendered on the server with Chromium (installed in the Docker image).

## Requirements

| Needed | Notes |
|---|---|
| Node.js 22 and npm 10+ | for development, or just Docker for production |
| Docker 24+ (recommended) | builds and runs the production image |
| A Supabase project | [supabase.com](https://supabase.com) (hosted) **or** [self-hosted Supabase](https://supabase.com/docs/guides/self-hosting) |
| An HTTPS domain | required for the mobile app and for browser storage outside `localhost` |

Reasonable starting size: 1 vCPU, 2 GB RAM for the web app (PDF rendering uses Chromium), plus your Supabase.

## Quick start

```sh
git clone https://github.com/yajvazi/operix-invoice-web.git
cd operix-invoice-web
```

Then follow steps 1 to 4 below.

## 1. Create the backend (Supabase)

1. Create a Supabase project (hosted, or self-hosted).
2. Note these values from **Project settings → API**:
   - the project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - the publishable (anon) key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - the `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**secret**, server only, never in a browser or mobile app)
3. In **Authentication → URL configuration** set the *Site URL* to your web address and add
   `https://YOUR-DOMAIN/auth/callback` to the redirect allow-list.
4. In **Authentication → Providers** keep *Email* enabled. For a private installation you may switch off
   "Allow new users to sign up" after you create your own account.
5. Configure an SMTP server under **Authentication → SMTP** so confirmation and password-reset emails are delivered.
6. Optional: enable **Google** and/or **Apple** under **Authentication → Providers**. The sign-in page then shows
   "Continue with Google / Apple" automatically, and the mobile app does too. Add `operix-invoice://auth-callback` to the
   redirect allow-list for the mobile app. Step-by-step instructions: [docs/SOCIAL-SIGN-IN.md](docs/SOCIAL-SIGN-IN.md).

## 2. Set up the database

Run the three files in [`database/`](database) **in order** on a **new, empty** Supabase project. Use the
SQL editor, or `psql` with the connection string from **Project settings → Database**:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/01-schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/02-storage-and-auth.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/03-seed.sql
```

| File | What it does |
|---|---|
| `01-schema.sql` | Tables, functions, row-level-security policies and grants (~200 tables) in the `public` and `private` schemas. |
| `02-storage-and-auth.sql` | Storage buckets (`product-images`, `operix-expense-documents`) with their access rules, and the sign-up trigger. |
| `03-seed.sql` | Reference data: roles and permissions, chart-of-accounts template, expense and income categories. |

Notes:

- The schema is generated from the production migrations with the Booking, HR, Desk, Support and AI
  product tables removed. It is tested by loading it into a blank database.
- Do **not** run these files on a database that already holds data you care about.
- There is no automatic upgrade path yet. See [Backups and upgrades](#backups-and-upgrades).

## 3. Configure the app

```sh
cp .env.example "apps/OperiX Invoice/OperiX Web/.env.production"   # for Docker / production builds
cp .env.example "apps/OperiX Invoice/OperiX Web/.env.local"        # for local development
```

Edit the file. The minimum:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_INVOICE_APP_URL=https://invoices.yourcompany.com
NEXT_PUBLIC_SELF_HOSTED=true
NEXT_PUBLIC_SERVER_NAME=Your Company Invoices
CRON_SECRET=a-long-random-string          # openssl rand -hex 32
```

> **`NEXT_PUBLIC_*` values are compiled into the app at build time.** Change one and you must rebuild.
> Everything else is read when the server starts.

## 4. Run it

### With Docker (recommended)

```sh
docker compose up -d --build
```

The app listens on port 3000. Put a reverse proxy with HTTPS in front of it (Caddy, nginx, Traefik).
Example Caddyfile:

```
invoices.yourcompany.com {
    reverse_proxy 127.0.0.1:3000
}
```

Health check: `GET /api/health` returns `{"status":"ok"}`.

### Without Docker

```sh
npm install --legacy-peer-deps
npm run build
npm run start            # http://localhost:3000
```

PDF export needs Chromium: install it and set `CHROME_EXECUTABLE_PATH` (for example `/usr/bin/chromium`).

## 5. First sign-in

1. Open your web address and choose **Sign up**. Confirm the email address.
2. Complete the company setup: company name, tax/registration numbers, currency and language.
   You become the workspace administrator.
3. Under **Settings** add your logo, bank details and invoice template, then invite your team
   (**Settings → Users & Access**) and assign roles. Permissions are per action (for example creating invoices,
   applying discounts, changing dates, exporting data).
4. Create your first customer, product and invoice.

## Connect the mobile app

The OperiX Invoice mobile app can use your own server instead of the OperiX cloud:

1. Make sure the web app is reachable over **HTTPS** and `NEXT_PUBLIC_SELF_HOSTED=true` is set.
2. In the web app open **Settings → Mobile app**. A QR code appears for your server address.
3. On the phone open **OperiX Invoice → Connect to your own server → Scan QR code**. (You can also type
   the address, or scan the QR code with the phone camera.)
4. Check the server name the app shows, confirm, and sign in with an account created on your server.
   "Switch back to OperiX Cloud" on the same screen undoes it.

How it works: the app calls `GET /api/connect` on your web address, which returns your Supabase URL and
publishable key (values every browser already receives). The QR code contains only your web address.
No password or secret is ever in it. The mobile app accepts `https://` addresses, and `http://` only for
local networks (for testing).

## Configuration reference

All settings live in `.env.example` with comments. The important ones:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Your Supabase project URL (browser-visible). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable/anon key (browser-visible). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side key for billing, webhooks, the public API and admin jobs. **Secret.** |
| `SUPABASE_INTERNAL_URL` | no | Address the server uses to reach Supabase when it differs from the public one (Docker networks). |
| `NEXT_PUBLIC_INVOICE_APP_URL` | yes | Public address of this app. Used in QR codes on invoices and in links. |
| `NEXT_PUBLIC_SELF_HOSTED` | recommended | `true` hides the hosted billing and subscription screens. |
| `NEXT_PUBLIC_SERVER_NAME` | no | Name shown in the mobile app when connecting. |
| `NEXT_PUBLIC_PAYWALL_ENABLED` | no | `true` shows a subscription paywall on cloud workspaces without an active Stripe subscription (hosted service). Always off when `NEXT_PUBLIC_SELF_HOSTED=true`. |
| `NEXT_PUBLIC_POS_ENABLED` | no | `true` enables the point of sale. Read the [notice](#important-notices) first. |
| `CRON_SECRET` | recommended | Protects `/api/cron/*` maintenance endpoints. |
| `CHROME_EXECUTABLE_PATH` | for PDFs | Path to Chromium (set in the Docker image). |
| `STRIPE_*` | no | Only if you sell subscriptions. See below. |

## Optional features

- **Stripe subscriptions.** The code includes Stripe Billing (checkout, customer portal, webhooks). A private,
  self-hosted installation does not need it: leave `NEXT_PUBLIC_SELF_HOSTED=true`. To sell subscriptions to
  your own customers, create your products and prices with `scripts/billing/stripe-setup.mjs`
  (`STRIPE_SECRET_KEY=... node scripts/billing/stripe-setup.mjs --webhook https://YOUR-DOMAIN`), then set the
  `STRIPE_*` variables from `.env.example`. Keep every Stripe secret on the server.
- **Public API and webhooks.** Developers tab in Settings. Requires `PUBLIC_API_*` secrets in `.env.example`.
- **Email sending.** Settings → Email (SMTP) for invoice emails from your own mail server.
- **Contract signing, CRM integration.** Off by default; see the commented sections of `.env.example`.

## Backups and upgrades

- **Database:** schedule `pg_dump` (or your Supabase plan's backups) and test restoring one. Also back up the
  Storage buckets (product pictures, expense documents).
- **Browser-storage workspaces:** each user downloads a backup file from Settings → Data storage.
- **Upgrading the app:** pull the new version, rebuild the image (`docker compose up -d --build`).
- **Upgrading the database:** release notes list any SQL to apply. Take a backup first. Until a migration
  folder is published, compare the new `database/01-schema.sql` with your database before applying changes by hand.

## Security checklist

- [ ] HTTPS everywhere; HSTS enabled at your proxy.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and every `STRIPE_*` secret only on the server, never committed.
- [ ] Row-level security left **on** for all tables (the schema enables it). Never expose the service role key to clients.
- [ ] SMTP configured, "confirm email" enabled in Supabase Auth.
- [ ] Sign-ups restricted if the installation is private.
- [ ] Database and storage backups scheduled and restore-tested.
- [ ] Keep Node, the Docker base image and dependencies updated.

## Development

```sh
npm install --legacy-peer-deps
cp .env.example "apps/OperiX Invoice/OperiX Web/.env.local"   # fill in your Supabase values
npm run dev          # http://localhost:3000
npm run typecheck
npm test
npm run lint
```

`npm run dev` and `npm run build` first copy the SQLite WebAssembly files into `public/sqlite`.

## Project layout

```
apps/OperiX Invoice/OperiX Web   the Next.js web app (pages, API routes, components)
packages/                        shared libraries: api, accounting, billing, money, payroll,
                                 invoice-template, report-templates, i18n, types, ...
database/                        SQL for a new Supabase project (schema, storage, seed)
scripts/billing/                 Stripe setup helper
docker-compose.yml               production container
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Blank page or "not configured" | `NEXT_PUBLIC_SUPABASE_*` missing at build time. Set them and rebuild. |
| Sign-up email never arrives | SMTP not configured in Supabase Auth. |
| Redirected to login in a loop | Site URL / redirect allow-list in Supabase Auth does not match your domain. |
| PDF download fails | Chromium missing; set `CHROME_EXECUTABLE_PATH`. |
| Mobile app: "not an OperiX server" | The address is wrong, not HTTPS, or `/api/connect` is blocked by your proxy. |
| Billing/webhook errors | `SUPABASE_SERVICE_ROLE_KEY` not set on the server. |
| "In this browser" storage unavailable | The page must be served over HTTPS (or `localhost`). |

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## Security reports

Please do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## Licence

Copyright © OperiX and contributors. Licensed under the **GNU Affero General Public License v3.0**
([LICENSE](LICENSE)). You may use, study, modify and share this software. If you run a modified
version for users over a network, you must give those users the corresponding source code.

The names "OperiX" and "OperiX Invoice" and the logos are not covered by this licence and may not be
used to suggest that your fork or service is the official one. The OperiX mobile apps are separate,
closed-source products and are not part of this repository.
