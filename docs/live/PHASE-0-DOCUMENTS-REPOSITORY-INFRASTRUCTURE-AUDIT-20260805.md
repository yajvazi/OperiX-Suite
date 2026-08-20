# Phase 0 — OperiX Documents repository and infrastructure audit

## Phase name

Phase 0 — Repository and infrastructure audit

## Date and timestamp

2026-08-05T11:37:48Z (UTC)

## Summary

The requested Documenso/Stirling PDF deployment must not proceed to production.
The audit found a usable OperiX monorepo and live VPS, but the repository is on
a dirty feature branch, the supplied working directory is not the repository,
the shared provider-neutral Documents platform does not exist, no staging
Documenso/Stirling environment exists, and the VPS is under significant memory
pressure. Existing production services are running and were not modified.

The current platform has useful foundations that should be extended rather than
duplicated: Supabase Auth and company membership/RLS, a company-scoped invoice
schema, financial document attachment metadata, append-friendly outbox records,
immutable `audit_events`, private Supabase storage buckets, a host Nginx proxy,
Docker Compose isolation patterns, and historical database/storage backup
artifacts.

Go/no-go: **NO-GO for production deployment and schema changes.** Stop after
Phase 0 until the blockers below are resolved and an explicitly approved,
staging-first implementation phase is authorized.

## Audit scope and method

Read-only inspection covered:

- `/root/OperiX` repository layout, package manifests, source paths, migrations,
  current Git state, and existing tests.
- Live Docker, Compose, network, volume, image, port, health, and resource
  state on the VPS.
- Live Nginx, Certbot, UFW, Fail2Ban, systemd timer, monitoring, and backup
  state. Existing secret values and private keys were not printed.
- Live Supabase/PostgreSQL catalog metadata, RLS flags, relevant policies,
  storage bucket metadata, and migration history. Business document contents
  were not queried.
- Historical backup manifests and restore-verification artifacts.

The supplied working directory
`/root/Documents/Codex/2026-08-05/you-are-working-on-the-existing` is empty and
is not a Git repository. The actual monorepo discovered on the host is
`/root/OperiX`. `rg` is not installed on the host; repository searches used
the available `grep`/`find` fallback.

## Current architecture

```text
OperiX Invoice Web (Next.js) ─────┐
OperiX Invoice Mobile (Expo) ────┼── direct Supabase Auth/Data API access
OperiX HR/Scanner/Tracker ────────┘

OperiX Invoice Web PDF routes ── Puppeteer/Chromium in the web request process

OperiX Invoice/Suite ── host Nginx ── localhost Docker ports
                                  ├─ Invoice Web :3006
                                  ├─ Suite       :3013
                                  └─ Supabase API via /supabase/ :54321

OperiX Supabase stack ── dedicated Docker project/network/volumes
OperiX CRM ───────────── dedicated Postgres, Redis, volumes, and networks
OperiX Desk ──────────── separate FastAPI/Vite deployment and upload volume
Mailcow ──────────────── existing SMTP/mail stack
Monitoring/logging ───── Prometheus, Grafana, Loki, Alloy, cAdvisor

Missing:
  OperiX Documents API
  OperiX Sign provider adapter / Documenso
  OperiX PDF provider adapter / Stirling PDF
  Document version store and immutable lifecycle
  Shared document worker/queue
  Provider webhook processor
```

## Repository findings

### Monorepo and package manager

- Package manager: npm 10.9.4, declared in [`package.json`](../../package.json).
- Workspace manager: Turborepo 2.x with npm workspaces `apps/*`, `apps/*/*`, and
  `packages/*`.
- Shared packages currently include accounting, API/Supabase client helpers,
  compliance, context, fiscalization, hooks, i18n, invoice-template, money,
  offline-pos, payroll, report-templates, types, and UI.
- No `packages/documents`, `packages/signatures`, `packages/storage`,
  `packages/audit`, or shared processing queue package exists.
- The root package has `build` and `lint` scripts but no root `test` script.

### Applications

- OperiX Invoice Web: Next.js 16.2.x, Supabase SSR/client libraries,
  `puppeteer-core`, native invoice UI, server API routes, and print/document
  pages.
- OperiX Invoice Mobile: Expo/React Native, direct Supabase client access, and
  client-side PDF generation helpers.
- OperiX HR: Expo/React Native application sharing the Invoice packages.
- OperiX Scanner and Tracker: Expo/React Native applications sharing the common
  API/context/hooks/i18n/types/UI packages.
- OperiX Desk: separate FastAPI/Vite application with its own JWT user model,
  audit model, and upload volume.
- OperiX Suite: Next.js marketing/product surface. Its current product pages
  reference product concepts, but no Booking application backend was found.

### Authentication, organization, and permissions

- Supabase Auth is the primary Invoice/mobile authentication system.
- The tenant boundary is currently represented by `companies`, `profiles`, and
  `memberships`; the active company is held on the profile.
- The database contains `app_roles`, `app_permissions`, and
  `membership_role_assignments`, with company permission helpers used by recent
  migrations.
- Existing invoice RLS is company-aware, but application code frequently queries
  Supabase directly from client components. A new Documents API must establish a
  server-owned authorization boundary and must not pass provider credentials to
  these clients.
- Desk uses a separate local JWT/user/role system and is not currently a shared
  Documents backend.

### Existing PDF and document implementation

- Invoice Web generates PDFs using Puppeteer/Chromium in request handlers under
  `apps/OperiX Invoice/OperiX Web/src/app/api/`.
- The invoice PDF route and several report/product PDF routes accept rendered
  payloads and launch Chromium directly. They do not implement the requested
  document versioning, storage hash, queue, provider abstraction, or lifecycle.
- Customer ledger PDF checks a Supabase session. The general invoice PDF,
  transaction PDF, and product-import PDF routes do not show equivalent session
  authorization in the handler, and all lack the required operation-specific
  limits/rate controls for expensive rendering.
- Mobile and HR have local PDF helpers; no shared authoritative object-storage
  document model was found.
- Existing `financial_document_attachments` stores bucket/path/checksum-like
  metadata for financial records, but it is not an immutable version store and
  does not model the requested generated/processed/frozen/signing/signed/archive
  stages.
- Existing `document_source_links` models accounting/document relationships, not
  file versions or signature envelopes.

### Existing audit and queue foundations

- `public.audit_events` exists and has an immutable trigger in the compliance
  foundation migration. It is company-scoped and permission-filtered for reads.
- `domain_outbox_events` exists as an append-friendly transactional outbox.
- No shared worker consuming that outbox for PDF/signature work was found.
- No BullMQ, Celery, RQ, or shared Redis queue implementation was found in the
  monorepo. CRM Redis and Mailcow Redis are workload-specific and must not be
  reused without explicit isolation and capacity approval.
- Desk has application audit records and a local upload volume, but its separate
  architecture should not be silently merged into the Invoice/Supabase tenant
  model.

## Database findings

- The live OperiX Supabase/PostgreSQL stack is PostgreSQL 17.6.1.063.
- Live catalog inspection found `invoices`, `companies`, `profiles`,
  `memberships`, RBAC tables, `financial_document_attachments`,
  `document_source_links`, and `audit_events`.
- Live catalog inspection found no `documents`, `document_versions`,
  `document_processing_jobs`, `signature_envelopes`,
  `signature_recipients`, or `signature_events` relations.
- The live Supabase migration history contains 25 entries and reports latest
  version `20260728192000`. The repository contains 70 migration files and has
  untracked 20260801/20260805 migrations, so repository/live migration drift
  must be reconciled before any new migration is generated or applied.
- All inspected public business tables have RLS enabled. New document and
  signature tables must continue this pattern, use organization/company
  predicates, and keep service-role writes server-side.
- Supabase API schemas expose `public` and `graphql_public`; this is an existing
  client-facing architecture and does not authorize exposing provider APIs.
- Supabase local config has a 50 MiB storage limit. Production limits must be
  independently enforced at the OperiX API/worker boundary.

### Storage

Live storage buckets are:

| Bucket | Public | Audit result |
|---|---:|---|
| `logos` | true | Existing public bucket; unsuitable for private signed/business documents. |
| `signatures` | false | Private, but not a versioned document store. |
| `stamps` | false | Private, but not a versioned document store. |

The repository contains a later untracked migration referring to an
`employee-documents` bucket, but that bucket was not present in the live bucket
catalog and the migration is not in live migration history. Do not assume it is
available for Documents.

## Infrastructure findings

### Live services and projects

Docker Server 29.1.3 is running these relevant Compose projects:

- `operix`: 13 containers across the generated application and Supabase
  Compose definitions. The app definition is outside the repo at
  `/root/vps-migration/app-compose-secret/operix.json`; Supabase uses
  `/root/vps-migration/supabase-compose.SECRET.json`.
- `operix-crm`: isolated Twenty server, worker, Postgres, Redis, and volumes
  from `infrastructure/operix-crm/docker-compose.yml`.
- `monitoring`: Prometheus, Grafana, cAdvisor, and node-exporter.
- `logging`: Loki, Alloy, and a Docker socket proxy.
- `mailcowdockerized`: 18 mail services, including SMTP.

No Documenso, Stirling PDF, or document worker container exists.

### Networking and public exposure

- Nginx is the active host reverse proxy on ports 80/443. It must be preserved.
- Certbot manages existing certificates, including `invoice.operixsuite.com`,
  `operixsuite.com`, `desk.operixsuite.com`, and `crm.operixsuite.com`.
- Invoice and Suite are bound to localhost host ports 3006 and 3013. Nginx
  forwards `invoice.operixsuite.com` to Invoice Web and also exposes the current
  `/supabase/` route to localhost port 54321.
- Supabase Postgres, Studio, Kong/API, Mailpit, and analytics host ports are
  localhost-bound. No Documenso/Stirling port is currently exposed.
- `operix_default` is a non-internal bridge network containing the Invoice Web
  and Suite containers. CRM has an internal network and a separate edge network.
  A new `operix-documents-internal` network is not present.
- The intended new provider flow should attach only the OperiX backend and
  document worker to the new internal network. It must not join the public
  proxy network or publish provider ports.

### Resource capacity

Read-only host measurements:

| Resource | Current finding |
|---|---|
| CPU | 4 vCPU; load approximately 1.11–1.29 during audit |
| RAM | 7.8 GiB total; approximately 1.4 GiB available |
| Swap | 4 GiB configured and fully used |
| Root disk | 251 GiB total; approximately 190 GiB free, 22% used |
| Root inodes | Approximately 15 million free, 11% used |
| Docker image/cache | Approximately 19.1 GiB images and 7.0 GiB build cache |
| Container limits | Invoice Web, Suite, and CRM containers have no explicit memory/CPU limit in live inspection |
| Monitoring | `logging-alloy-1` is unhealthy due repeated 5-second health-check timeouts |

The available RAM and exhausted swap are not a safe baseline for concurrent
Documenso, dedicated PostgreSQL, Stirling PDF, OCR/LibreOffice, and a worker.
Capacity planning, operation limits, and a staging synthetic workload are
required before any deployment decision.

### Firewall and administration

- UFW is active with default incoming deny and allows SSH, HTTP/HTTPS, and
  Mailcow mail ports.
- No provider ports are allowed, which is appropriate for the initial private
  design.
- Fail2Ban currently reports only the `sshd` jail.
- Existing Nginx and certificate management are operational. No proxy change was
  made during this audit.

### Backups and recovery

- `/opt/platform/bin/backup` and backup documentation describe a Restic-based
  encrypted off-host backup design, but `platform-backup.timer` and
  `platform-backup.service` are not installed/registered in systemd and there
  are no journal entries for that service.
- Historical backup evidence exists: a verified Supabase/PostgreSQL backup set,
  an OperiX pre-Phase-F dump, and an August 1 Supabase storage restore-drill
  artifact with checksums.
- These artifacts are useful safety evidence but do not constitute current
  Documenso/Stirling backup coverage. New database, object storage, provider
  configuration, signing certificate, webhook, and secret-rotation backups must
  be designed and tested before production.

### CI/CD and environments

- No `.github/workflows` directory was found in `/root/OperiX`.
- Production OperiX containers are managed from generated host-side Compose
  JSON rather than a repository workflow visible in this audit.
- Staging reverse-proxy templates exist, but no staging Documenso/Stirling or
  OperiX Documents runtime was found in `docker compose ls`.
- Existing repository Compose files use floating `latest` tags for the Invoice
  Web and Suite images. New provider images must be reviewed and pinned to
  exact releases or immutable digests; the existing release process also needs
  a tag-pinning gate before it can safely carry this feature.

## Security risks

High-priority risks to resolve before implementation:

1. No provider boundary exists. Adding provider calls directly to browser/mobile
   code would violate the required credential and replaceability model.
2. The current invoice PDF route launches Chromium without visible
   authentication, queueing, resource limits, or rate limits. It is an expensive
   request-path operation and a denial-of-service risk if publicly reachable.
3. There is no immutable document version model or signed-file freeze invariant.
4. The live `logos` storage bucket is public. It is not a valid location for
   private business documents or signed PDFs.
5. Repository-tracked `.env` files exist for Invoice Mobile and HR. Their
   contents were not printed; they must be reviewed for accidental secrets before
   provider work, and production/provider secrets must remain untracked.
6. The production app images use floating `latest` tags in repository Compose
   definitions; this is incompatible with the requested release discipline.
7. The VPS has only about 1.4 GiB available RAM and fully used swap. Large PDF,
   OCR, merge, conversion, and signature workloads could affect existing mail,
   Supabase, CRM, and application services.
8. The active logging Alloy container is unhealthy, reducing confidence in
   operational detection while adding a new document pipeline.
9. The database has migration drift between repository files and the live
   migration history. Applying a new migration before resolving this could
   create an unsafe schema baseline.
10. The current public Supabase API route is part of the existing app design;
    new Documents provider endpoints must remain application-owned and must not
    expose Documenso/Stirling raw APIs.

## Existing reusable components

- `packages/types`, `packages/api`, `packages/context`, `packages/hooks`, and
  `packages/ui` for shared client/domain conventions.
- Invoice Web Supabase server/client helpers and existing API route conventions.
- `companies`, `memberships`, permission helpers, and company-scoped RLS.
- `financial_document_attachments` and `document_source_links` as related
  metadata foundations, subject to extension rather than duplication.
- `audit_events` immutability and the transactional `domain_outbox_events`
  foundation.
- Existing Supabase private storage buckets and storage service.
- Existing host Nginx/Certbot, Docker Compose, local-only application bindings,
  historical backups, and monitoring stack.
- Existing UI tokens/components in Invoice Web and shared UI packages.

## Proposed changes after the no-go blockers are resolved

1. Establish a clean implementation branch/worktree from the intended OperiX
   baseline and reconcile current dirty/untracked work before editing shared
   schema or deployment files.
2. Create one provider-neutral shared Documents domain package, extending the
   existing conventions. It should own document lifecycle types, hashing,
   validation, storage metadata, PDF provider interfaces, signature provider
   interfaces, idempotency, and safe provider-error mapping.
3. Add server-owned Invoice Documents API routes and a webhook route. Keep all
   Documenso/Stirling identifiers and credentials server-side.
4. Add additive, reviewed Supabase migrations for `documents`,
   `document_versions`, processing jobs, signature envelopes/recipients/events,
   provider metadata, immutable audit linkage, and invoice foreign-key links.
   Use existing `company_id` as the current organization boundary unless a
   deliberate organization abstraction is introduced.
5. Use a new private storage bucket or approved private object store with
   organization-scoped immutable paths. Do not use the public `logos` bucket.
6. Add a dedicated internal Docker network and separate Documenso dependencies
   (database/user, storage, SMTP, signing certificate/secrets) plus a private
   Stirling service and a constrained document worker. Do not reuse CRM/Mailcow
   databases, Redis, volumes, or credentials.
7. Select a queue implementation only after capacity and compatibility review.
   A Postgres-backed job table/outbox may be preferable to reusing a workload-
   specific Redis, but this must be validated against throughput and failure
   recovery requirements.
8. Add feature flags disabled by default, organisation activation, file/page/
   operation limits, per-tenant and global concurrency limits, temporary-file
   cleanup, cancellation, retries/dead-letter handling, metrics, and structured
   redacted logs.
9. Replace or protect current request-path PDF operations incrementally. No
   operation may modify an immutable signed version.
10. Add staging providers with synthetic documents, provider OpenAPI/spec
    verification, webhook replay tests, tenant-isolation tests, and restore
    drills before any production activation.
11. Add CI/CD gates for typecheck, lint, tests, migration validation, secret
    scanning, image scanning, pinned-image checks, staging health, backup
    verification, manual production approval, and rollback.

## Files expected to change in a future implementation phase

No implementation files were changed in Phase 0. Expected future scope is:

- `packages/documents/**` or the repository-approved equivalent shared package.
- Invoice Web server API/lib files for Documents, processing, signatures,
  downloads, permissions, flags, and Documenso webhooks.
- `supabase/migrations/<timestamp>_documents_*.sql` and related test fixtures.
- Invoice Web and mobile UI files for native Preview/Prepare/Request Signature/
  Send/Download flows, using existing OperiX components.
- Tests for provider clients, lifecycle transitions, RLS/tenant isolation,
  webhook idempotency, hashes, version locking, and failure recovery.
- An additive infrastructure directory for the two private provider services,
  worker, dedicated network, health checks, resource limits, and backup hooks.
- Committed `.env.example` files containing names only and feature-flag defaults.
- Deployment, architecture, schema, API, webhook, security, backup, monitoring,
  troubleshooting, licensing, and application-extension documentation.

## Database migrations expected

No migration was created or applied in Phase 0. Future migrations are expected
to add, subject to schema review and staging validation:

- Provider-neutral documents and immutable document versions.
- Processing jobs with organization scope, idempotency, attempts, progress,
  timeouts, and terminal error state.
- Signature envelopes, recipients, provider-neutral states, and provider
  metadata.
- Signature webhook event persistence with provider-event uniqueness and safe
  payload retention.
- Invoice links such as active document/envelope IDs and independent signature
  status, without duplicating the generic model.
- RLS, grants, indexes, append-only audit triggers/policies, and any required
  storage policies.

## Services expected to be added later

None were added in Phase 0. The approved target design should eventually add
isolated, pinned services equivalent to:

- `operix-documenso` plus dedicated Documenso PostgreSQL/storage dependencies.
- `operix-stirling-pdf` with no public host port.
- `operix-documents-worker` with controlled CPU/memory/concurrency.
- A private Documents API surface hosted by the existing OperiX backend unless
  repository conventions justify a separate service.

## Configuration variables expected later

No production values were added. The committed examples should eventually
include, following repository naming conventions:

```text
DOCUMENTS_ENABLED=false
PDF_PROVIDER=stirling
STIRLING_PDF_ENABLED=false
STIRLING_PDF_BASE_URL=
STIRLING_PDF_API_KEY=
STIRLING_PDF_TIMEOUT_MS=120000
STIRLING_PDF_MAX_FILE_BYTES=52428800
STIRLING_PDF_MAX_PAGES=500
SIGNATURE_PROVIDER=documenso
DOCUMENSO_ENABLED=false
DOCUMENSO_BASE_URL=
DOCUMENSO_API_KEY=
DOCUMENSO_WEBHOOK_SECRET=
DOCUMENSO_TEAM_ID=
DOCUMENT_STORAGE_BUCKET=
DOCUMENT_STORAGE_REGION=
DOCUMENT_STORAGE_ENDPOINT=
DOCUMENT_STORAGE_ACCESS_KEY=
DOCUMENT_STORAGE_SECRET_KEY=
DOCUMENT_PROCESSING_CONCURRENCY=
DOCUMENT_PROCESSING_TIMEOUT_MS=
```

Signing certificate paths/passwords, SMTP credentials, database credentials,
provider keys, webhook secrets, and production environment files must remain
outside Git in the existing root-owned secret convention or an approved secret
manager.

## Tests performed and results

- `npm run test --workspaces --if-present`: **PASS**. Existing web/shared
  package tests passed, totaling 50 tests in this run.
- Invoice Web `npm run typecheck`: **PASS**.
- Root `npm test`: **FAIL/NOT CONFIGURED** because the root package has no
  `test` script.
- Live `docker ps`, `docker compose ls`, network/volume/image inspection,
  resource measurements, and health inspection: **COMPLETED read-only**.
- Live Supabase catalog/RLS/storage/migration metadata inspection:
  **COMPLETED read-only**.
- No provider integration tests were run because Documenso and Stirling are not
  deployed and no staging services exist.
- No production migration, deployment, restart, DNS, certificate, port, proxy,
  or secret operation was attempted.

## Security validation

- Provider credentials were not added, printed, or exposed.
- No provider API is currently publicly exposed.
- Existing provider ports are absent, and new provider ports were not opened.
- Existing database, Redis, object-storage, Supabase, proxy, and application
  services were not changed.
- Existing RLS and audit foundations were inspected.
- The public `logos` bucket, unauthenticated/expensive PDF routes, tracked env
  files, lack of provider boundary, missing immutable document model, and
  migration drift remain open risks.

## Backup validation

- Historical backup manifest and SHA-256 verification evidence were inspected.
- Existing Supabase database and storage restore-drill artifacts were found.
- The platform backup script and encrypted off-host design were inspected.
- Current scheduled platform backup execution was **not validated**: the
  expected systemd unit/timer is not installed and has no journal entries.
- No Documenso/Stirling backup coverage exists because those services do not
  exist yet.

## Deployment status

**Not deployed.** No production configuration, Compose project, network, port,
reverse proxy, DNS, certificate, database, storage bucket, or secret was
modified.

## Remaining risks and blockers

The following must be closed before a production deployment go decision:

- Clean branch/worktree and explicit ownership of the current untracked/dirty
  changes.
- A repository path/workspace contract so future work is performed in the
  intended monorepo rather than the empty supplied directory.
- Staging environment and synthetic provider test plan.
- VPS memory/swap capacity plan and PDF workload limits; consider a larger host
  or separate worker host.
- Migration drift reconciliation and verified pre-change database/storage
  backups.
- Dedicated private storage bucket/object-store decision.
- Queue/worker compatibility and operational ownership.
- Provider image/version review, OpenAPI review, and image vulnerability scan.
- Documenso signing certificate, SMTP, secret, license/edition, and controlled
  signer-route decisions.
- Stirling feature/image-size/OCR/LibreOffice decision and resource benchmark.
- Active backup timer/restore procedure for the actual production host.
- Monitoring remediation, especially unhealthy Alloy and missing provider
  metrics/alerts.
- CI/CD workflow and manual production approval gate.

## Licensing questions

Unresolved; no legal conclusion is made. Before commercial exposure, human review
must record the exact Documenso edition/license and Stirling PDF edition/license
and answer:

- Is customer-facing SaaS/API use permitted?
- Are user, workspace, envelope, or feature limits applicable?
- Is embedded signing included and licensed?
- Is OperiX branding/white-labeling allowed?
- Is commercial redistribution/OEM use allowed without a separate agreement?
- What copyright, attribution, source, or license notices must be retained?

The implementation must not claim legal compliance, qualified-signature status,
Kosovo fiscalisation, TAK reporting, EFS certification, or tax compliance from a
Documenso signature.

## Rollback instructions

Phase 0 made no production changes, so there is no production rollback to
execute. Preserve the current Git worktree and host state.

For the next approved phase:

1. Take and validate a database-native backup, object-storage backup, and
   configuration/secret backup before any change.
2. Validate Compose and proxy configuration without starting services.
3. Add new services and networks only; do not alter or restart unrelated
   containers.
4. If validation fails, stop the new workload, remove only the new staged
   resources, and restore only from the verified backup if data was changed.
5. For database changes, use a forward corrective migration or restore into a
   non-production staging database. Do not use destructive rollback SQL against
   live signed-document history.
6. Preserve all immutable document versions and signature/audit events during any
   recovery.

## Go/no-go decision

**NO-GO.** Do not begin production deployment, provider installation, migration,
proxy exposure, DNS/certificate work, or customer-facing feature activation.

The safe stop is required by the available capacity, missing staging/provider
prerequisites, absent shared architecture, incomplete backup scheduling,
migration drift, and current repository state.

## Recommended next phase

After the blockers are explicitly resolved, perform a design/preflight phase in a
clean branch with no production mutation. That phase should finalize the
provider-neutral package boundary, schema migration plan, private storage
choice, queue/worker design, image/version and license review, staging topology,
capacity benchmark, backup/restore plan, and CI/CD gates. Only after its
validation gates pass should a separate approved infrastructure-only release be
considered.

