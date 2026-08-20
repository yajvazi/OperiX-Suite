# OperiX CRM / Twenty integration plan

Status: repository audit complete; first-release implementation plan
Date: 2026-08-05

## Audit summary

The repository is an npm workspaces monorepo orchestrated by Turbo. The root
package is still named `invoice-monorepo`; the relevant web applications are
`apps/OperiX Suite` (`operix-suite-marketing`) and
`apps/OperiX Invoice/OperiX Web` (`web-suite`). There is no Twenty source tree,
no existing CRM gateway package, no authenticated Suite launcher, and no
reverse-proxy configuration checked into this repository.

The current working tree already contains unrelated user changes in
`apps/OperiX Desk/docker-compose.yml`, a deleted generated Turbo log, and an
untracked storage-isolation migration. Those changes are out of scope and must
be preserved.

## Relevant repository paths

| Concern | Existing path | Finding |
| --- | --- | --- |
| Workspace tooling | `package.json`, `turbo.json`, `package-lock.json` | npm 10 workspaces, Turbo 2, TypeScript 5.9 |
| Suite product surface | `apps/OperiX Suite/src/content/site.ts`, `src/components/product-carousel.tsx`, `src/components/full-home-page.tsx` | Public/preview product catalog; no authenticated launcher |
| Suite brand assets | `apps/OperiX Suite/public/brand/` | Existing OperiX logos, marks, product icons |
| Suite brand tokens | `apps/OperiX Suite/src/app/globals.css` | Primary `#004ffe`, hover currently `#0043d8`, neutral surfaces, radii, shadows, focus outline |
| Invoice application shell | `apps/OperiX Invoice/OperiX Web/src/components/app-shell.tsx` | Authenticated navigation and company switcher |
| Invoice auth/session | `apps/OperiX Invoice/OperiX Web/src/lib/supabase/{client,server,proxy}.ts`, `src/proxy.ts` | Supabase Auth with server-side cookie refresh and protected routes |
| Workspace/tenant selection | `apps/OperiX Invoice/OperiX Web/src/hooks/use-workspace.ts` | User profile selects `active_company_id`; membership resolves current company |
| Invoice customer model | `apps/OperiX Invoice/OperiX Web/src/lib/resource-config.ts`, `src/lib/models.ts` | `clients` table, `ClientRow`, company-scoped customer CRUD |
| OperiX org model | `supabase/migrations/supabase-schema.sql`, `supabase/migrations/supabase-companies.sql` | `companies`, `memberships`, `profiles`, `company_id`; RLS is membership/company based |
| Existing database migrations | `supabase/migrations/` | Timestamped SQL migrations; tables are Supabase/Postgres-owned |
| Existing server routes | `apps/OperiX Invoice/OperiX Web/src/app/api/` | Next.js Route Handlers; health, cron, customer ledger, payments, payroll, PDF |
| Existing tests | `apps/OperiX Invoice/OperiX Web/src/lib/*.test.ts` | Vitest unit tests; Playwright is installed for browser tests |
| Deployment conventions | `docker-compose.web.yml`, `docker-compose.suite.yml`, app Dockerfiles, `apps/OperiX Desk/docker-compose.yml` | Compose services, localhost-bound ports in some apps, health checks, restart policies, JSON log limits in Desk |
| Reverse proxy | repository-wide search | Not present; production proxy is external and must be changed separately after inspection |
| Integration/event infrastructure | repository-wide search | No shared event bus, queue, integration service, entity mapping table, or webhook processor found |
| Backups | repository-wide search | No central server-side backup runbook or CRM backup convention found; mobile has local export/restore |

## Existing authentication and tenant model

OperiX Invoice uses Supabase Auth. The browser receives only the publishable
Supabase key; server routes use the SSR client and refreshed auth cookies.
Authenticated routes are protected by `src/lib/supabase/proxy.ts`, while public
routes are explicitly allow-listed. A user can have memberships in multiple
`companies` and selects one through `profiles.active_company_id`. Existing RLS
policies use `memberships.company_id` or the legacy `profiles.company_id` path,
depending on migration age.

Twenty must not share or forge these sessions. The initial release keeps
separate Twenty login and uses a server-side API key only in the integration
gateway. Future SSO should use a supported OIDC/SAML capability and an explicit
OperiX user/workspace mapping.

## Existing customer model

OperiX Invoice owns `public.clients`. A customer has a UUID, `company_id`,
`user_id`, name, contact fields, address/location, and tax identifiers. The
customer is referenced by invoices, payments, recurring invoice templates, and
contracts. Customer matching must therefore use durable stored mappings and
company scope; names and email addresses are not link identities.

## Existing deployment architecture

The repository builds Next.js applications in Docker and exposes app ports to
the host. `docker-compose.suite.yml` runs the Suite marketing app on
`127.0.0.1:3013`; `docker-compose.web.yml` runs Invoice on port 3006. The Desk
compose file demonstrates the stronger local convention of localhost-bound
ports, health-gated dependencies, restart policies, resource limits, and JSON
log rotation. No Nginx/Caddy/Traefik file exists here, so adding a proxy file
would be unsafe; the CRM runbook will provide a reviewed host-level snippet
and require an operator to merge it into the existing proxy configuration.

## Twenty version and supported configuration

The implementation is prepared against the exact upstream Twenty `v2.8.0`
Docker artifacts reviewed on 2026-08-05. The upstream compose uses the
`twentycrm/twenty:${TAG}` image, `PG_DATABASE_URL`, `SERVER_URL`, `REDIS_URL`,
`ENCRYPTION_KEY`, `APP_SECRET`, and `STORAGE_TYPE`/`STORAGE_S3_*`; the worker
shares the server storage volume and disables duplicate migrations/cron
registration. The current upstream docs describe API keys as
`Authorization: Bearer ...` and webhook validation using
`X-Twenty-Webhook-Signature` plus `X-Twenty-Webhook-Timestamp`.

The repository will not use the user-suggested unsupported names such as
`TWENTY_DATABASE_URL` when Twenty does not support them. OperiX-only gateway
settings are kept in the Invoice app environment and are never passed to the
browser.

## Proposed first release

1. Add `infrastructure/operix-crm/` with a version-pinned Twenty server,
   worker, Postgres 16, and Redis deployment. Bind only to localhost, use an
   internal network, isolated named volumes, health checks, restart policies,
   log limits, environment validation, and backup/restore/upgrade scripts.
2. Add a centralized `operix-crm` configuration module to the Suite catalog,
   with a configurable CRM URL, permission/status metadata, and the required
   launcher/product card. Because no authenticated launcher exists today, this
   first card is a normal first-party external application link; tenant-aware
   visibility is documented as the next shell integration once a shared
   authenticated launcher exists.
3. Add a centralized OperiX CRM branding foundation for configuration and
   upstream customization boundaries. Do not vendor or rewrite Twenty source in
   this monorepo; maintain branding as an upstream-backed fork/customization
   overlay, with `operix/main` merging `upstream/main`.
4. Add a Supabase migration for `integration_entity_links`, immutable-ish
   `integration_events`, and audit records. Enforce organization scope,
   uniqueness, indexes, RLS, and no cross-application cascading deletes.
5. Add a server-only Twenty adapter, strict webhook signature verification,
   tenant/idempotency validation, customer-linking service foundation, and
   internal API route under existing Next.js conventions.
6. Add feature flags with all CRM synchronization and automatic financial
   record creation disabled by default.
7. Add unit/integration-oriented tests for mappings, signatures, idempotency,
   tenant checks, URL generation, and outage/error classification. Browser E2E
   coverage will begin when an authenticated launcher exists.

## Source-of-truth model

| Domain | Owner | CRM representation |
| --- | --- | --- |
| Leads, opportunities, sales activities, relationship ownership | OperiX CRM / Twenty | Native Twenty records |
| Companies and people relationship context | OperiX CRM / Twenty | Native Twenty records plus stored OperiX links |
| Legal billing identity, invoices, payments, accounting | OperiX Invoice | `companies`, `clients`, invoices, payments |
| Employees and payroll | OperiX HR / current HR app | Reference only |
| Reservations and desk bookings | OperiX Booking / Desk | Reference only |

Shared fields are synchronized through explicit field ownership rules. Initial
customer synchronization is link-first and conflict-reporting; it is not
unrestricted bidirectional synchronization.

## Integration gateway design

The existing Invoice Next.js server is the first gateway host because it already
has server-side Supabase access and the customer model. It will expose only
server routes and call Twenty with a bearer API key from server environment.
The gateway owns:

- Twenty API adapter and typed request/response normalization.
- Invoice customer adapter constrained by `organization_id`/`company_id`.
- HMAC webhook verification with timestamp replay protection.
- Entity links, idempotency keys, retry classification, and event history.
- Structured, sanitized audit logs and correlation IDs.

If event volume later requires durable workers, this module can move behind a
dedicated integration service without changing the database contract or public
application links.

## Feature flags and rollback controls

Use existing environment conventions where available; initial flags are:

```text
OPERIX_CRM_ENABLED=false
OPERIX_CRM_SYNC_CUSTOMERS=false
OPERIX_CRM_CREATE_DRAFT_ON_WON=false
OPERIX_CRM_DEEP_LINKS_ENABLED=false
OPERIX_CRM_WEBHOOKS_ENABLED=false
```

The launcher can be disabled with `OPERIX_CRM_ENABLED`. Webhook processing can
be paused independently. No draft quote or invoice is created unless its flag
is explicitly enabled. Twenty can be stopped without changing Invoice, HR,
Booking, or Desk data.

## Implementation phases

### Phase 1 — audit and documentation

This document, architecture overview, data ownership, customer sync, SSO,
deployment, backup/restore, upgrade, and troubleshooting runbooks.

### Phase 2 — isolated infrastructure

Compose, env example, pinned versions, health checks, volumes, network,
validation, backups, restore guidance, and external reverse-proxy instructions.

### Phase 3 — Suite catalog/launcher foundation

OperiX CRM card, URL configuration, icon reuse, status metadata, and product
navigation additions without iframe embedding or visual redesign.

### Phase 4 — gateway and durable links

Migration, adapter, webhook route, validation, idempotency, links, logs, and
feature gates.

### Phase 5 — customer-linking workflow

Create-or-link Invoice customer only when enabled, persist mappings, report
conflicts, and add controlled contextual links. Opportunity-won draft creation
remains disabled by default.

### Phase 6 — hardening and future SSO

Tenant permission mapping, admin status surface, reconciliation jobs, supported
OIDC/SAML design, staging rollout, and upstream upgrade rehearsal.

## Risks

- The existing Suite is a marketing/preview site, not a real authenticated
  launcher; permission-aware visibility cannot be truthfully enforced there
  until the authenticated shell is identified or built.
- Twenty is schema-per-workspace and self-hosted configuration changes between
  releases; exact version pinning and staging upgrades are required.
- Existing Supabase schema has both legacy `profiles.company_id` and newer
  `memberships` paths; all new integration rows must use a single, explicit
  organization/company authorization function.
- Webhook event payloads can change and may contain sensitive data; payloads
  must be redacted before logging and stored only as needed for replay/audit.
- External reverse-proxy state is not in Git, so production routing needs a
  reviewed operator change.

## Migration strategy

Additive migration only. Create new integration tables with UUID primary keys,
unique source/target link constraints, organization indexes, RLS, and no
foreign keys that delete records in another application. Apply locally and in
staging first; inspect the SQL and use the repository's Supabase migration
workflow. Rollback is a controlled migration or disablement of integration
processing, not deletion of customer or CRM records.

## Rollback approach

1. Set `OPERIX_CRM_ENABLED=false` and `OPERIX_CRM_WEBHOOKS_ENABLED=false`.
2. Disable customer sync and automatic draft creation independently.
3. Stop only the `operix-crm` compose project if Twenty is unhealthy.
4. Keep event rows and errors for reconciliation; do not delete mappings.
5. Restore Twenty Postgres and local storage from matching backups only after
   validating the target version and encryption key.
6. Reconcile event and mapping status before re-enabling processing.

## Test strategy

- Vitest unit tests in the existing Invoice web app for HMAC validation,
  timestamp/replay checks, idempotency, tenant checks, mapping uniqueness,
  field ownership, error classification, and URL generation.
- Route-level tests for invalid signatures, duplicate events, wrong-company
  events, and disabled flags.
- Supabase SQL/RLS checks for organization isolation and unique constraints.
- Playwright tests for the CRM card/URL and future authenticated launcher.
- Build, typecheck, and lint for touched workspaces; do not introduce a new
  test runner.

## Observability and security

Every gateway request/event gets a correlation ID and event ID. Logs include
system/entity/status/attempt/duration, but never credentials, authorization
headers, passwords, session tokens, or full customer payloads. API keys remain
server-only. Webhook HMAC comparison is timing-safe, timestamp bounded, and
rate-limitable at the proxy. Redirects use configured absolute HTTPS URLs only.

## Exact initial-release files

### Files to create

- `docs/live/OPERIX-CRM-TWENTY-INTEGRATION-PLAN.md`
- `docs/architecture/operix-crm-overview.md`
- `docs/architecture/operix-crm-data-ownership.md`
- `docs/architecture/operix-crm-customer-sync.md`
- `docs/architecture/operix-crm-sso-plan.md`
- `docs/runbooks/operix-crm-deployment.md`
- `docs/runbooks/operix-crm-backup-restore.md`
- `docs/runbooks/operix-crm-upgrade.md`
- `docs/runbooks/operix-crm-troubleshooting.md`
- `infrastructure/operix-crm/docker-compose.yml`
- `infrastructure/operix-crm/.env.example`
- `infrastructure/operix-crm/README.md`
- `infrastructure/operix-crm/scripts/{backup.sh,restore.sh,healthcheck.sh,upgrade.sh}`
- `infrastructure/operix-crm/reverse-proxy/README.md`
- `infrastructure/operix-crm/branding/{operix-crm-branding.json,README.md}`
- `supabase/migrations/20260805090000_operix_crm_integration.sql`
- `apps/OperiX Invoice/OperiX Web/src/lib/crm/{config,flags,types,security,twenty-client,entity-links,customer-linking}.ts`
- `apps/OperiX Invoice/OperiX Web/src/app/api/webhooks/twenty/route.ts`
- `apps/OperiX Invoice/OperiX Web/src/app/api/internal/crm/status/route.ts`
- `apps/OperiX Invoice/OperiX Web/src/app/api/health/route.ts` (CRM-safe
  status fields only)
- `apps/OperiX Invoice/OperiX Web/src/lib/crm/*.test.ts`

### Files expected to modify

- `apps/OperiX Suite/src/content/site.ts`
- `apps/OperiX Suite/src/components/product-carousel.tsx` (only if the
  existing card shape requires it)
- `apps/OperiX Suite/src/app/globals.css` (only shared catalog styling if
  required; no new CRM visual language)
- `apps/OperiX Suite/.env.example` or an equivalent documented deployment env
  surface, if one is added without exposing secrets
- `apps/OperiX Suite/.gitignore` and `apps/OperiX Invoice/OperiX Web/.gitignore`
  to allow safe placeholder `.env.example` files while continuing to ignore
  real environment files
- `apps/OperiX Invoice/OperiX Web/.env.example`
- `apps/OperiX Invoice/OperiX Web/package.json` only if a currently installed
  dependency is insufficient (avoid adding one for HMAC/HTTP)

No Twenty core source files are modified in this monorepo. Twenty branding is
kept in its upstream-backed fork/customization process and documented here.

## Acceptance gates for this release

The CRM card is configurable and can be disabled; Twenty uses isolated
Postgres/Redis/storage and pinned images; no secrets are committed; mappings
are durable and tenant-scoped; webhook signatures and duplicate events are
handled safely; automatic financial records remain off; existing applications
build and test unchanged; and runbooks cover deployment, backup/restore,
upgrade, troubleshooting, and rollback.
