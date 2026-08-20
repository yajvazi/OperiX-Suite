# Phase 0A — Documents Platform Readiness Remediation

Date: 2026-08-07 UTC

Decision: **NO-GO**

Score: **5 of 10 readiness gates cleared**

Scope: Platform readiness remediation only. No Documenso, Stirling PDF,
Redis, additional PostgreSQL instance, object storage provider, queue,
worker, public route, domain, certificate, or customer-facing Documents
feature was deployed.

## Executive summary

The Phase 0 audit was read completely and every reported blocker was
revalidated against the repository, the live self-hosted Supabase project,
the running Docker workloads, and the VPS. Remediation was performed
conservatively in an isolated Git worktree. The original dirty worktree was
not cleaned, reset, rebased, or overwritten.

Completed or materially improved:

- A current preservation bundle now captures the original worktree status,
  diffs, untracked files, permissions, and a secret-excluding archive.
- The documented Restic backup package and systemd service/timer are installed
  and syntax-validated. A pre-change database/configuration backup was
  created and validated.
- No production migration was applied, rewritten, or manually marked.
  Migration drift was catalogued and documented instead of hidden.
- Selected content-preserving image pins were applied and the affected
  containers were recreated one at a time. Compose validation passes.
- Alloy is running healthy with zero restarts and no recent error-level
  messages. Centralized collection was explicitly limited to core OperiX
  projects; excluded services retain their Docker-local logs. Warning-level
  transfer timeouts remain.
- The public logos bucket remains intentionally public, but now has a 2 MiB
  limit and PNG/JPEG/WebP MIME allowlist. It contains zero objects and no
  repository consumer or upload path was found.
- Focused security remediation for all five existing PDF routes was prepared
  in the isolated worktree, with authentication, server-side company
  resolution, source checks, limits, timeouts, concurrency controls, URL
  restrictions, cleanup, and audit logging. It was not deployed.
- Current memory and swap behavior is understood well enough to reject the
  current VPS as a safe Documents host. Separate staging and production
  Documents capacity is recommended.
- Staging and shared Documents architecture plans were created without
  credentials, provider containers, domains, certificates, or routes.

The phase remains NO-GO because the automated backup cannot be enabled without
the real protected off-host repository configuration; migration provenance is
not fully reconciled; several unrelated production containers still use
moving or local image references; PDF fixes are not in the running Invoice Web
image; and a suitably isolated Documents host has not been provisioned or
approved. These are intentional safety stops.

## Initial blockers

The Phase 0 report identified:

1. No shared Documents, signatures, storage, or queue architecture.
2. No staging Documenso or Stirling deployment.
3. Approximately 1.4 GiB available memory at the audit point.
4. Fully used swap at the audit point.
5. Production migration drift.
6. No installed platform backup timer.
7. Existing PDF routes without sufficient authorization and resource
   controls.
8. A public logos bucket.
9. Floating latest tags in repository and production Compose definitions.
10. Unrelated dirty and untracked worktree changes.
11. Unhealthy Alloy logging service.

## Revalidation results

| Blocker | Revalidation | Phase 0A result |
|---|---|---|
| Shared Documents architecture | No Documents/signature/job repository was present; adjacent legacy document tables exist | Design checkpoint created only |
| Staging providers | No Documenso or Stirling staging deployment exists | Staging foundation documented only |
| Memory | 15 GiB total; 6.2–6.8 GiB available during final samples; no sustained swap storm | Current platform is healthier than the old snapshot, but not a Documents capacity guarantee |
| Swap | 4 GiB configured; approximately 1.6 GiB used; first vmstat sample showed activity, following samples were near zero | No swapoff or cache drop; capacity risk remains |
| Migration drift | 25 live migration rows; support/storage provenance mismatches remain | No migration applied; gate unresolved |
| Backup timer | Units absent initially; Restic credentials/repository absent | Units installed but timer intentionally disabled; gate unresolved |
| PDF routes | Five server-side Chromium/Puppeteer routes identified | Focused fixes prepared but not deployed; gate unresolved |
| Logos bucket | Public, zero objects, no repository consumers/uploads found | Public purpose retained; upload surface tightened |
| Image tags | Several latest/moving/local refs found in definitions and running containers | Selected pins applied; residual runtime refs remain |
| Worktree | Dirty feature branch with unrelated changes and concurrent additions | Preserved and isolated |
| Alloy | Configuration parsed; old pipeline showed transfer warnings and target churn | Healthy with explicit core-project filter; residual warnings documented |

## Workstream A — Worktree preservation

The original worktree remains at /root/OperiX on branch
agent/phase-f-payroll. Its original base commit was
6b99267abf9c420f495450dc105e0bc1dd823a0d. It was not cleaned or made
artificially clean.

Remediation worktree:

- Branch: agent/phase-0a-documents-platform-readiness
- Path: /root/OperiX-phase-0a-documents
- Base commit: 6b99267abf9c420f495450dc105e0bc1dd823a0d

Classification of the original worktree:

- Documents-related or potentially related: existing storage/migration
  material was preserved for later review; no existing Documents package was
  found.
- Existing unrelated work: Desk, Suite, Support, CRM, mobile, Meta-channel,
  webhook, and other application changes.
- Generated artifacts/build output: Turbo cache/log files, node_modules,
  and the tracked generated Turbo log deletion.
- Secret or environment files: environment examples and the protected CRM
  environment file. Secret contents were not copied into reports or the
  safe archives.
- Unknown/concurrent work requiring preservation: later Support/mobile/docs
  additions and concurrent migration
  supabase/migrations/20260807120000_phase_c_meta_channels.sql.

Preservation bundles:

| Bundle | Contents | Evidence |
|---|---|---|
| /var/backups/platform-phase-0a/20260807T060022Z-worktree-preservation | Initial status, tracked/staged diffs, untracked list, permissions, safe tar, base Git bundle | Safe tar SHA-256 8bb8d08ee8127e3d97d57b2c688ea453e2c673e37824df2aeea202dc81762257 |
| /var/backups/platform-phase-0a/20260807T060534Z-worktree-revalidation-preservation | New migration and current revalidation state | Safe tar SHA-256 33e804686613b7d99f4582012d9812ed5cb22f7c0a62781bcab64b5ee7af5a0c |
| /var/backups/platform-phase-0a/20260807T064400Z-worktree-final-preservation | Complete current status/diffs/untracked list, permissions, secret-excluding safe tar, HEAD bundle | Safe tar SHA-256 5108f77f67d45b6f30bb34b762b284b6726dbae96275b0db37b5b02a1b184bf1 |
| /var/backups/platform-phase-0a/20260807T064814Z-worktree-final-final-preservation | Latest status/diffs/untracked list after another concurrent change, permissions, secret-excluding safe tar, HEAD bundle | Safe tar SHA-256 a5d4eaed522783bc9b2ab7c13f7cb0469fe3a1a873dc22a7914dc9cfb99791ef |

The latest 064814Z bundle is authoritative for the original worktree state;
its tracked-diff checksum matched immediately after capture. The current
repository is reproducible from the recorded base commit and bundles. No
secret material was committed.

## Workstream B — Backup automation

The existing backup design was used; no second backup system was invented.
The documented command is /opt/platform/bin/backup. It uses Restic, invokes
application backup hooks, includes platform/configuration paths, performs
retention, and runs a Restic check. The existing Supabase helper is used only
when a defined instance exists.

Changes:

- Installed Restic 0.18.0.
- Installed the documented service at
  /etc/systemd/system/platform-backup.service.
- Installed the documented timer at
  /etc/systemd/system/platform-backup.timer.
- systemd-analyze verify passed.
- bash -n /opt/platform/bin/backup passed.
- Did not enable the timer because
  /opt/platform/shared/secrets/backup.env and the existing off-host Restic
  repository configuration are absent.

Pre-change backup:

- Location: /var/backups/platform-phase-0a/20260807T060253Z-prechange/
- Included logical dumps for Supabase and OperiX CRM, globals, restore lists,
  storage/CRM volume archives, and protected non-secret platform configuration.
- SHA256SUMS validation passed for every produced file.
- pg_restore -l succeeded for both database dumps.
- gunzip -t succeeded for globals.
- Tar readability checks succeeded.
- Permissions were root-only on the protected backup directory.
- Existing historical restore evidence under
  /root/vps-migration/backups was used because creating an additional
  PostgreSQL instance is prohibited in this phase.

The controlled command
PLATFORM_ROOT=/opt/platform /opt/platform/bin/backup
fails closed with ERROR: Missing backup environment. The timer is installed
but disabled, has no next execution, and has no successful last execution.
Therefore the backup gate is **FAIL**.

Runbook: docs/runbooks/backup-and-restore.md in the remediation worktree.

## Workstream C — Migration drift

Live migration history was read from
supabase_migrations.schema_migrations. It contains 25 rows, from
20240523162352 through 20260728192000. The Supabase CLI is not installed, so
catalog inspection used the existing container-local PostgreSQL client.

Relevant classifications:

| Finding | Classification | Action |
|---|---|---|
| Support tables/functions/policies from tracked 20260806111345 migration exist, but its history row is absent | Schema object present but migration not recorded | No history rewrite; origin and owner-approved reconciliation still required |
| Employee-document storage policies exist from untracked 20260801100138 material, but no employee-documents bucket or objects exist | Schema object present but migration not recorded; incomplete feature | No apply or manual marker |
| CRM migration material has no corresponding integration tables in production | Repository migration missing in production; not part of this phase | Preserved and not applied |
| Concurrent 20260807120000 phase-C Meta migration has no corresponding observed relations | Repository migration missing in production; concurrent work | Preserved untouched |
| Legacy non-14-digit SQL scripts are not in current migration history | Legacy/manual baseline with incomplete provenance | Not treated as runnable migrations |
| Documents/signature relations are absent | Expected absence | No Documents schema created |

The live schema has document-adjacent legacy tables
employee_documents, document_sequences, document_source_links, and
financial_document_attachments, but no shared Documents/signatures/job
architecture.

A pre-change schema snapshot is recorded at
/var/backups/platform-phase-0a/20260807T060410Z-migration-prechange/live-schema.sql
with SHA-256
add6d65d4a31dc3bbbdd9063dbecb46385c9d8cfd94732381bc74cbeaf7545fe.

No migration was applied, no applied migration file was modified, and no
history row was manually inserted. There is no unknown Documents drift, but
the support/storage migration lineage is not proven. The migration gate is
**FAIL** until the source/checksum lineage is identified or an owner-approved
additive reconciliation migration is prepared after a new backup and schema
snapshot.

Report: docs/live/MIGRATION-DRIFT-REPORT-20260807.md in the remediation
worktree.

## Workstream D — Container image pinning

Content-preserving local tags were created from the currently running image
IDs; no replacement release was pulled. Selected workloads were recreated
one at a time with no dependency recreation:

| Workload | Previous reference | Current image ID prefix | Pin/result |
|---|---|---:|---|
| OperiX Invoice Web | operix-invoice-web:latest | f2816d218324 | build-20260807-f2816d218324; healthy, zero restarts |
| OperiX Suite | operix-suite-marketing:latest | f57acec26e1a | build-20260807-f57acec26e1a; healthy, zero restarts |
| Homepage x2 | homepage:latest | e0bcec13ebe3 | v1.8.0; both healthy |
| Mailcow Ofelia | mcuadros/ofelia:latest | 13d086902ffd | 0.3.22; running, zero restarts |
| Alloy | grafana/alloy:v1.18.0 | fa92e0b416b1 | version tag with locally recorded digest |
| Loki | grafana/loki:3.5.2 | 9db2b58a344 | locally recorded digest; not recreated |

Compose definitions were also changed to exact local content-derived tags
where a safe pull-free pin was available for nginx, memcached, Feneri, IKD
Web, OpenCode, Mailcow MariaDB, and the Support image. The associated
unrelated containers were not recreated.

Remaining active moving/local runtime references include nginx:alpine,
memcached:alpine, mariadb:10.11, couchdb:3.3, ubuntu:24.04,
louislam/uptime-kuma:1, the Docker socket proxy master tag, and local/built
application image references. These were not changed because doing so would
restart unrelated production services or affect a reverse proxy. Compose
validation passes, but the runtime container gate is **FAIL** until a
separately approved rolling pinning change is completed.

Report: docs/live/PRODUCTION-IMAGE-INVENTORY-20260807.md in the remediation
worktree.

## Workstream E — Alloy

Alloy configuration syntax and the Compose definition validate. The existing
health check runs the Alloy version command; it does not prove that Docker
logs reach Loki. The source and discovery components are documented by
Grafana as the log collection path:
[loki.source.docker](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/)
and
[discovery.docker](https://grafana.com/docs/alloy/latest/reference/components/discovery/discovery.docker/).

The observed failure mode was not a persistent syntax or authentication
failure. It was target churn and transfer timeout behavior in a broad
Docker-discovery pipeline under resource pressure. The exact upstream cause
of every warning cannot be proven from the available logs.

Reversible remediation:

- Added --disable-reporting.
- Retained 30-second discovery refresh to avoid stale target IDs.
- Disabled HTTP/2 in the source HTTP client.
- Added a keep rule for the core OperiX, CRM, Support, logging, and monitoring
  Compose projects.
- Kept the Docker socket proxy and did not expose a new port.
- Preserved local Docker logs for excluded services.

Validation:

- Container running and healthy.
- Restart count: zero after remediation.
- Current memory: approximately 112 MiB of a 256 MiB cgroup at the final
  sample.
- Last 10-minute summary: 0 error-level and 177 warning-level log messages.
- Loki labels API returned success and core labels.
- Loki /ready returned HTTP 503 even though the container health check and
  labels API were healthy; this readiness-check discrepancy remains an
  operational risk.

Outcome: Alloy is no longer an unexplained unhealthy service, but centralized
coverage was deliberately narrowed and warning-level transfer timeouts remain.
The logging gate is counted as **PASS with residual risk**, not as evidence
that every Docker workload is centrally collected.

## Workstream F — Public logos bucket

The bucket belongs to the local self-hosted Supabase project OperiX. It
contained zero objects at audit time. Repository search found no
storage.from('logos') consumer and no client upload path. No invoice,
signature, tenant, or customer document references were found.

The bucket remains public intentionally as a legacy public-brand-assets
bucket. The following metadata was applied and validated:

- public: true
- file size limit: 2 MiB
- MIME allowlist: image/png, image/jpeg, image/webp
- object count: zero
- no client insert/update/delete policy references logos

The private signatures, stamps, and support-attachments buckets were not made
public. No sensitive public document was found. SVG, HTML, and
script-capable upload types are not allowed for logos.

Outcome: Storage gate **PASS**, with future logo upload code required to use a
trusted service-side path and organisation-safe opaque names.

Report: docs/live/STORAGE-EXPOSURE-REPORT-20260807.md in the remediation
worktree.

## Workstream G — Existing PDF routes

The following routes were found:

| Route | Application | Security status in isolated worktree |
|---|---|---|
| POST /api/pdf | Invoice Web | Auth, server company resolution, optional invoice source check, schema/body/HTML/PDF limits, timeout, concurrency, asset URL policy |
| POST /api/transactions/pdf | Invoice Web | Permission/company checks, source table allowlist, source ownership checks, bounded rows, browser/output controls |
| POST /api/customers/ledger/pdf | Invoice Web | Permission/company/customer checks, invoice/payment ownership checks, bounded entries and browser/output controls |
| POST /api/products/import/pdf | Invoice Web | Permission/company checks, import-batch ownership, bounded items and browser/output controls |
| GET /api/payroll/payslips/[id] | Invoice Web | Permission plus existing RPC access decision, UUID validation, CSP, bounded HTML/PDF and browser controls |

The shared helper adds:

- request byte, HTML, output, array, and string limits;
- server-derived active company and permission checks;
- source-entity ownership checks;
- two global and one per-company in-process renderer slot;
- launch, navigation, render, and cleanup timeouts;
- JavaScript disabled for rendered pages;
- HTTPS-only approved asset domains;
- rejection of file, loopback, private, metadata, credentialed, and
  unapproved URLs;
- safe filenames, generic errors, and audit records without invoice contents.

Focused unit tests now cover:

- unauthenticated access;
- client company mismatch;
- insufficient permission;
- oversized request body;
- render timeout;
- missing source entity;
- local-file, loopback, private-IP, and unapproved URL rejection;
- global and per-company concurrency.

Focused result: 1 test file, 8 tests passed. Invoice Web type checking passed.
The changes are not in the running production image and were not exercised
against live customer data. The PDF security gate is therefore **FAIL** until
an explicitly approved build/canary/redeploy of only Invoice Web completes the
integration matrix.

Report: docs/live/PDF-ROUTE-SECURITY-REPORT-20260807.md in the remediation
worktree.

## Workstream H — Memory, swap, and capacity

Final host samples:

- RAM: 15 GiB total, 9.4 GiB used, 2.5 GiB free, 4.3 GiB cache,
  6.2 GiB available.
- Swap: 4 GiB configured, approximately 1.6 GiB used.
- vmstat: initial sample had swap I/O; subsequent samples were near zero.
- No restarting or exited containers.
- No kernel OOM evidence since 2026-08-01.
- Largest observed consumers included ClamAV at approximately 759 MiB RSS,
  CRM worker/server at approximately 503/498 MiB, Alloy at approximately
  184 MiB cgroup usage before the final lower sample, MySQL at approximately
  242 MiB, and Prometheus at approximately 231 MiB.
- Docker reported approximately 23.14 GB build cache and 17.78 GB
  reclaimable images. No prune was run because rollback value and ownership
  were not proven.

No swapoff, cache drop, mass stop, broad cleanup, or unrelated service
restart was performed. The host is not actively thrashing in the short final
sample, but occupied swap and the existing multi-service workload mean that
available RAM must not be treated as Documents capacity.

Planning estimates, not measurements:

| Component | Conservative range |
|---|---:|
| Documenso application | 0.5–1.5 GiB |
| Dedicated Documents PostgreSQL | 0.5–2 GiB |
| Stirling light operations | 0.5–1.5 GiB |
| Stirling OCR | 1.5–4 GiB per active process |
| LibreOffice | 1–3 GiB per active process |
| Worker | 0.25–1 GiB |
| Queue/Redis | 0.1–0.5 GiB |
| One to four concurrent heavy jobs | additional 1–6 GiB |
| Existing platform reserve | at least 4–6 GiB |

Recommended planning target:

- Separate staging VPS: 8–16 GiB RAM, depending on OCR/Office scope.
- Separate production Documents host: at least 16 GiB RAM, 4 vCPU, and
  80–100 GB fast storage, with private networking and independent backups.

The capacity gate is **FAIL** for deployment on the current VPS. The
recommended topology is a separate staging VPS and a separate production
Documents host. Upgrading this VPS is an alternative only after retiring or
moving existing workloads and proving failure reserve.

Report: docs/live/MEMORY-CAPACITY-REPORT-20260807.md in the remediation
worktree.

## Workstream I — Staging foundation

Staging was selected as a separate approved VPS by default. Local-only
development is the fallback until that host exists. The plan defines:

- placeholder staging domain strategy, with no DNS change;
- private application/database/storage/queue networks;
- separate database and private storage;
- root-only or approved secret-manager path with placeholders only;
- isolated SMTP capture/sandbox;
- staging-only signing certificate strategy, with no certificate request;
- backup, restore, monitoring, queue-depth, job-duration, and storage alerts;
- Documents disabled by default with tenant/provider feature flags;
- CI gates for schema, type, tests, RLS, image digests, secret scanning,
  Compose, migration dry-run, and backup/restore evidence;
- rollback by stopping intake, disabling flags, draining jobs, and applying
  forward database fixes.

No credentials, provider containers, database, bucket, route, domain, or
certificate was created. The staging foundation gate is **PASS as a
design-only checkpoint**, pending infrastructure approval.

Plan: docs/architecture/documents-staging-topology.md in the remediation
worktree.

## Workstream J — Shared architecture checkpoint

The design defines provider-neutral boundaries:

- packages/documents: metadata, versions, lifecycle, source links;
- packages/signatures: envelopes, recipients, signing events, adapters;
- packages/storage: tenant-scoped object references and signed URL contracts;
- packages/queue: idempotent jobs, retries, cancellation, and dead letters.

Every document, version, envelope, recipient, job, object, and audit event
must receive a server-derived company_id. RLS and server authorization both
enforce tenant access. Existing invoice/payroll tables retain ownership of
source entities. Provider adapters may not leak Documenso or Stirling types
into shared contracts. Webhooks are signature-verified and replay-safe.

The architecture checkpoint is **PASS as documentation only**. No package,
table, provider, API, worker, queue, or customer feature was implemented.

Plan: docs/architecture/documents-shared-architecture.md in the remediation
worktree.

## Changes made

Repository changes in the isolated worktree:

- Five Invoice Web PDF route files and the shared PDF security helper/tests.
- Seven Invoice Web call sites updated to send server-verifiable source
  context.
- Three isolated Compose definitions updated with safe image references.
- Backup/restore runbook, migration drift report, image inventory, PDF
  security report, storage exposure report, memory/capacity report, staging
  topology plan, and shared architecture plan.

Host/platform changes:

- Restic package installed.
- Documented backup service/timer installed but not enabled.
- Alloy configuration and Compose command/filter adjusted.
- Selected host deployment manifests received exact local image references.
- Logos bucket metadata tightened through the existing Supabase database.

Services changed:

- Recreated one at a time: Invoice Web, Suite marketing, two Homepage
  containers, Mailcow Ofelia, and Alloy.
- No all-services restart was run.
- No reverse proxy replacement or DNS/certificate change occurred.
- No Documents provider service was started.

## Backups created

Protected backup/audit locations:

- Worktree bundles listed in Workstream A.
- Pre-change production backup:
  /var/backups/platform-phase-0a/20260807T060253Z-prechange/
- Migration snapshot:
  /var/backups/platform-phase-0a/20260807T060410Z-migration-prechange/
- Image pinning pre-change evidence:
  /var/backups/platform-phase-0a/20260807T060811Z-image-pinning-prechange/
- Alloy pre-change evidence:
  /var/backups/platform-phase-0a/20260807T061216Z-alloy-prechange/

All protected backup directories were root-only. Secret-bearing operational
configuration was excluded from reports and safe archives.

## Required validation

| Validation | Command/result |
|---|---|
| Workspace tests | npm test --workspaces --if-present; 10 workspace test commands passed, 57 tests total |
| PDF security tests | npx vitest run src/lib/pdf-security.test.ts; 8 passed |
| Invoice Web typecheck | npm run typecheck; passed |
| Diff safety | git diff --check; passed |
| Root lint | npm run lint; failed only in pre-existing Desk frontend scope: 23 errors, 5 warnings |
| Relevant lint | Invoice Web: 0 errors, 8 warnings; Support: 0 errors; Suite: 0 errors, 1 warning |
| Compose | docker compose config -q for isolated web, suite, support and active platform definitions; passed |
| Backup syntax | bash -n /opt/platform/bin/backup; passed |
| Systemd units | systemd-analyze verify; passed |
| Backup archive | sha256sum -c SHA256SUMS, pg_restore -l, gunzip -t, tar readability; passed |
| Backup execution | documented command fails closed because backup.env is absent; expected unresolved gate |
| Migration status | live history and catalog checks passed; no reconciliation applied |
| Storage policy | bucket metadata and storage object policy query passed; logos has zero objects |
| Alloy | Compose config and Alloy fmt passed; container healthy, zero restarts, 0 recent errors |
| Existing containers | unhealthy=0, restarting=0, exited=0 |
| Reverse proxy | host nginx -t and admin/lrdy/mailcow nginx -t passed; Nginx remains active |
| Failed systemd units | systemctl --failed returned zero failed units |
| Local application probes | Existing local endpoints were probed without modifying listeners; expected 200/redirect/error statuses returned and no service was restarted |
| Memory/swap | free -h, swapon --show, vmstat, ps, docker stats, systemd-cgtop, journal/OOM checks completed |

The workspace test suite is green in the isolated worktree. This report
intentionally does not turn the unrelated Desk lint failure into a Documents
approval.

## Files modified and created

The complete machine-readable list is in the final worktree preservation
bundle. The principal isolated files are:

- apps/OperiX Invoice/OperiX Web/src/app/api/pdf/route.ts
- apps/OperiX Invoice/OperiX Web/src/app/api/transactions/pdf/route.ts
- apps/OperiX Invoice/OperiX Web/src/app/api/customers/ledger/pdf/route.ts
- apps/OperiX Invoice/OperiX Web/src/app/api/products/import/pdf/route.ts
- apps/OperiX Invoice/OperiX Web/src/app/api/payroll/payslips/[id]/route.ts
- apps/OperiX Invoice/OperiX Web/src/lib/pdf-security.ts
- apps/OperiX Invoice/OperiX Web/src/lib/pdf-security.test.ts
- docker-compose.web.yml
- docker-compose.suite.yml
- docker-compose.support.yml
- the eight supporting documents named above.

The original /root/OperiX worktree contains unrelated modifications and
untracked files; none were discarded.

## Remaining risks

1. There is no validated off-host automated backup because the protected
   repository configuration is missing.
2. Support/storage migration lineage is not proven and cannot be reconciled
   safely without owner/source confirmation.
3. Active unrelated containers still use moving or local image references.
4. PDF source fixes are isolated and not in the running production image.
5. The current VPS is not an approved or sufficiently isolated Documents host.
6. Alloy has warning-level transfer timeouts, narrowed centralized coverage,
   and a Loki readiness endpoint discrepancy.
7. The full root lint remains red in unrelated Desk code.
8. The focused PDF tests are unit-level; a later controlled canary still needs
   authenticated, cross-tenant, resource, Chromium, and live smoke coverage.
9. Concurrent work remains in the original dirty worktree and must not be
   merged or cleaned by this phase.

## Rollback instructions

Rollback must be approved and executed one change at a time.

- Repository: leave /root/OperiX untouched. If the isolated remediation is
  abandoned, preserve or archive /root/OperiX-phase-0a-documents and remove
  the branch only after owner confirmation. Do not use git reset --hard or
  git clean -fd.
- Logos metadata: after confirming no new objects or consumers, restore the
  prior NULL file limit/MIME metadata through an approved SQL change. Do not
  change public status without a consumer review.
- Alloy: restore the protected pre-change configuration from
  /var/backups/platform-phase-0a/20260807T061216Z-alloy-prechange/, validate
  it, and recreate only the Alloy container if an approved rollback is
  required. Preserve the socket proxy and Loki.
- Image pins: use the protected image-pinning pre-change manifests and
  recreate only the specifically approved service. Do not pull a new image
  or restart the reverse proxy as part of rollback.
- Backup units: leave the timer disabled until real credentials/repository
  configuration is installed and validated. Disable/remove only through an
  approved systemd change.
- PDF source: no production rollback is needed because the remediation was
  not deployed.

## Final readiness score

| Gate | Result | Reason |
|---|---|---|
| Repository | PASS | Dirty work preserved; remediation isolated; no secrets committed |
| Backup | FAIL | Units installed but no validated automated off-host backup or restore execution |
| Migration | FAIL | Support/storage provenance unresolved; no safe reconciliation approved |
| Containers | FAIL | Residual active moving/local runtime references remain |
| Logging | PASS with residual risk | Alloy healthy and bounded, but coverage is narrowed and warnings remain |
| Storage | PASS | Public logos bucket has explicit safe public purpose and no objects |
| PDF security | FAIL | Hardened source is isolated, not deployed or live-canary validated |
| Capacity | FAIL | Current host is not a safe Documents deployment target |
| Staging | PASS design-only | Separate-host topology and gates documented; no host approved/provisioned |
| Shared architecture | PASS design-only | Provider-neutral package and tenancy boundaries documented |

## Final recommendation

**NO-GO for Phase 1 Documents deployment.**

The platform is safer and the remaining blockers are now explicit, bounded,
and backed by evidence. Do not deploy Documenso, Stirling PDF, Redis, a new
PostgreSQL instance, storage provider, queue, worker, route, domain,
certificate, or customer-facing Documents feature from this phase.

## Exact next phase

Phase 1 remains deferred. The next authorized activity should be a
pre-deployment gate-clearing change set:

1. Obtain the already-approved off-host Restic repository and credentials,
   run one controlled backup, and complete an isolated restore.
2. Establish migration provenance and obtain approval for an additive
   reconciliation migration, if still required.
3. Complete the remaining runtime image pins through individually approved
   rolling changes.
4. Build and canary only the Invoice Web PDF security remediation, then run
   the full integration/security matrix.
5. Approve and provision separate staging capacity, with independent
   secrets, database, storage, SMTP capture, monitoring, and backup.
6. Re-run every final gate and request an explicit Phase 1 decision.

No Phase 1 deployment is authorized automatically by this report.
