# OperiX CI/CD implementation report

Implementation date: 2026-08-19 UTC  
Canonical checkout: `/root/OperiX`  
Canonical repository: `yajvazi/OperiX-Suite`  
Audited commit: `6b99267abf9c420f495450dc105e0bc1dd823a0d`  
Production deployment: **not executed**  
Staging deployment: **not executed**

## Executive result

The centralized CI/CD platform has been implemented in the canonical OperiX
monorepo worktree. It uses a registry-driven affected-application detector,
reusable GitHub Actions workflows, immutable Docker/PM2 release artifacts,
manual staging and production dispatch, environment approval gates, external
smoke checks, target-only VPS deployment, and automatic/manual rollback paths.

It is not release-ready yet. The implementation correctly remains blocked by
existing repository security findings, existing lint findings, migration
quality findings, absent deployment credentials/targets, and the fact that the
new workflows have not run on GitHub because the worktree changes have not been
committed/pushed. No failure was bypassed and no deployment was claimed as
successful.

## Applications discovered

The registry contains 14 pipeline applications: six `WEB`, one `STATIC_SITE`,
six `MOBILE`, and one `BACKEND`. The full inventory, legacy repository findings,
shared packages, and excluded services are in
[`OPERIX-APPLICATION-INVENTORY.md`](OPERIX-APPLICATION-INVENTORY.md).

| Application | Type | Source status | CI/CD implementation result |
|---|---|---|---|
| OperiX Suite Marketing | WEB | `origin-main` | Central CI configured; local production build passed; Docker release and target-only deployment workflow configured; existing live health route was 404, source route added |
| OperiX Invoice Web | WEB | `origin-main` | Reference web; typecheck, tests, production build, and local Docker image passed; existing lint error and security gates remain blocking |
| OperiX Invoice Mobile | MOBILE | `origin-main` | Reference mobile; full local CI and Expo export passed; QA build/release workflows are manual and approval-gated; manual QA not run |
| OperiX Booking Web | WEB | worktree-only | Production build passed with CI placeholders; lint fails on 9 errors/11 warnings; immutable PM2 archive and deployment workflow configured |
| OperiX Booking Mobile | MOBILE | worktree-only | Central Expo validation configured; no app lint/test script declared; no local full run |
| OperiX Desk Web | WEB | `origin-main` | Central lint/build and Docker release/deployment workflows configured; no staging target verified |
| OperiX Desk API | BACKEND | `origin-main` | Python compile passed; isolated backend/migration gates configured; Docker release/deployment workflow configured; no pytest suite discovered |
| OperiX Desk Mobile | MOBILE | worktree-only | Central Expo validation and manual QA/release architecture configured; no local full run |
| OperiX HR Web | WEB | worktree-only | Production build and lint passed locally (one warning); immutable PM2 archive and deployment workflow configured |
| OperiX HR Mobile | MOBILE | `origin-main` | Central Expo validation configured; tracked `.env` blocks the security gate |
| OperiX Control | WEB | worktree-only | Central CI and immutable PM2 release/deployment architecture configured; no local end-to-end run |
| OperiX Help Center | STATIC_SITE | worktree-only | Central CI and immutable Docker release/deployment architecture configured; existing live health check returned 200 |
| OperiX Scanner | MOBILE | `origin-main` | Central Expo/QA/release workflow configured; EAS project ID is still `YOUR_SCANNER_PROJECT_ID` |
| OperiX Tracker | MOBILE | `origin-main` | Central Expo/QA/release workflow configured; EAS project ID is still `YOUR_TRACKER_PROJECT_ID` |

CRM, Chatwoot/Support, the existing non-OperiX deployment platform, and other
visible GitHub repositories were audited but not modified.

## Workflows and reusable components created

Reusable and operational workflows added under `.github/workflows/`:

- `operix-ci.yml` — PR, `main`, and manual affected-app orchestrator with a required gate.
- `operix-security.yml` — registry validation, whitespace, secret, and dependency gates.
- `operix-web-build.yml` — architecture-specific web lint/typecheck/test/build/Docker validation.
- `operix-mobile-build.yml` — Expo config, lint/typecheck/test/export validation.
- `operix-backend-test.yml` — Python compile/tests, backend Docker validation, isolated Supabase reset/SQL test contract.
- `operix-release-artifacts.yml` — immutable GHCR image publishing and PM2 archive packaging.
- `operix-deploy-staging.yml` — manual staging deployment, smoke verification, and rollback.
- `operix-deploy-production.yml` — dispatch-only, `main`-only, approval-gated production deployment.
- `operix-smoke-test.yml` — HTTPS response/health/render smoke check.
- `operix-rollback.yml` — approval/environment-controlled manual or automatic rollback.
- `operix-mobile-qa-build.yml` — central mobile CI followed by an EAS preview/internal QA build.
- `operix-mobile-release.yml` — separately dispatched manual-QA-approved EAS release/TestFlight/Play-internal architecture.

Existing mobile workflows were retained as explicit manual compatibility/QA
entry points. Their normal PR/push duplication was removed, and the existing
QA runner remains the source of truth for Maestro, visual regression, reports,
and baseline policy.

Supporting implementation files:

- `.github/operix-apps.json` — app registry, commands, runtimes, health paths,
  deployment kinds, and shared-path fan-out rules.
- `scripts/cicd/affected-apps.mjs` — changed-path and shared-dependency detection.
- `scripts/cicd/run-app-command.mjs` — safe architecture-specific command runner.
- `scripts/cicd/validate-cicd-config.mjs` — registry/path/framework validation.
- `scripts/cicd/security-scan.mjs` — tracked env/high-confidence secret gate.
- `scripts/cicd/validate-migrations.mjs` — migration naming, duplicate, empty,
  and destructive-change gate.
- `scripts/cicd/write-release-metadata.mjs` — machine-readable release records.
- `deploy/operix/operix-deploy-dispatch` — checked-in restricted VPS contract;
  intentionally not installed or executed during this rollout.
- `docs/cicd/release-metadata.schema.json` — GHCR/PM2 release metadata schema.
- Safe `/api/health` routes were added to Suite Marketing, Booking Web, and HR
  Web. They expose only status, commit, build timestamp, and request time.

## GitHub state and approvals

The initial repository audit found no secrets, variables, Environments, branch
protection, or workflow tree on `origin/main`. The implementation created these
Environments through the GitHub API:

| Environment | Result |
|---|---|
| `staging` | Created; no secrets or reviewers configured |
| `production` | Created; required reviewer `yajvazi`; administrator bypass disabled; self-review prevention is not enabled |
| `mobile-qa` | Created; no secrets or reviewers configured |
| `mobile-release` | Created; required reviewer `yajvazi`; administrator bypass disabled; self-review prevention is not enabled |

No environment secret values were created or read. An independent production
reviewer must be added before a real release. Main branch protection and the
exact required status check cannot be configured accurately until the workflow
has run once from GitHub and exposed its check context.

## Validation performed

### Workflow and platform validation

| Check | Result |
|---|---|
| YAML parsing for all 14 workflow files | PASS |
| Actionlint 1.7.12 | PASS; no errors |
| Reusable-workflow input/permission/trigger contract check | PASS |
| `node --check` for all six CI/CD scripts | PASS |
| `bash -n` for the VPS deployment dispatcher | PASS |
| `git diff --check` on implementation scope | PASS |
| CI/CD registry validator | PASS — 14 applications: 6 WEB, 6 MOBILE, 1 BACKEND, 1 STATIC_SITE |
| Affected-app detector | PASS — all 14 apps; shared package/CI path fan-out configured |
| Release selection | PASS — 8 server artifacts: 5 Docker (including Desk API) and 3 PM2 archives |
| Root `npm ci --ignore-scripts --no-audit --no-fund --dry-run` | PASS |
| Release metadata generation and digest-shape validation | PASS |

### Representative web validation

- Invoice Web typecheck: **PASS**.
- Invoice Web tests: **PASS**, 8 files and 29 tests.
- Invoice Web production Next.js build: **PASS**, including `/api/health`.
- Invoice Web Docker production image build: **PASS**, local validation tag
  `operix-ci-invoice-web-validation:6b99267`.
- Invoice Web lint: **FAIL**, one existing `react-hooks/set-state-in-effect`
  error in `src/components/theme-provider.tsx:28` and nine warnings.
- Suite Marketing production build: **PASS**, including the new health route.
- Booking Web production build: **PASS** with non-production CI Supabase
  placeholders; its public health route compiled.
- Booking Web lint: **FAIL**, 9 errors and 11 warnings after adding the missing
  ESLint 9 flat config. The errors include the existing no-html-link rule,
  `react-hooks/set-state-in-effect`, and explicit `any` findings.
- HR Web production build: **PASS** with non-production CI Supabase
  placeholders; its public health route compiled.
- HR Web lint: **PASS** with one existing unused-variable warning.
- Desk backend compile: **PASS**; no Python test files were discovered.
- Desk API Docker production image build: **PASS** after the Dockerfile was
  updated to normalize its UTF-16 requirements file in the build layer.

CI uses `https://ci.invalid` and placeholder publishable values for build-time
public Supabase configuration. No production Supabase credentials are passed
to PR/build jobs.

### Representative mobile validation

Invoice Mobile `npm run test:ci` completed successfully:

- lint: PASS;
- TypeScript: PASS;
- localization: PASS — 1,473 English and 1,473 Albanian keys, no missing/extra keys;
- legacy tests: PASS — 8;
- shared/core tests: PASS — 13;
- unit tests: PASS — 47;
- UI/component tests: PASS — 35;
- integration tests: PASS — 3.

Invoice Mobile `expo export --platform web` completed successfully with 2,538
modules, 30 assets, and the generated web bundle. The EAS QA build and manual
QA were not run because no authorized EAS token/QA environment was present.

### Security and database validation

- Tracked real environment files: **FAIL**, exactly two found without printing
  values: `apps/OperiX Invoice/OperiX Invoice Mobile/.env` and `apps/hr-app/.env`.
- `npm audit --audit-level=high`: **FAIL**, 37 high and 2 critical advisories
  (62 total advisories in the current lockfile).
- Migration validator: **FAIL** on four findings:
  - empty `20260103021131_remote_schema.sql`;
  - empty `20260108_invoice_items_fields.sql`;
  - duplicate version `20260812181000` (company archiving / walk-in customer);
  - duplicate version `20260813190000` (booking hardening / Control projections).
- Migration inventory: 132 files, 39 legacy/non-timestamp names, 9 potentially
  destructive migration names.
- No CI test connected to the VPS Supabase stack or production data.

### VPS and deployment validation

- Nginx `nginx -t`: **PASS**.
- Existing public health probes: Invoice, Control, Desk, and Help Center
  returned 200; the existing Suite, Booking, and HR deployments returned 404.
- Source health routes for Suite, Booking, and HR were added and compiled, but
  were not deployed or re-probed.
- GHCR exact push/pull: **NOT VERIFIED**. The authenticated package API returned
  HTTP 403 because this environment lacks `read:packages`; no OperiX VPS GHCR
  pull credential was found.
- Staging deployment: **NOT RUN**; no staging target/credentials existed.
- Production deployment: **NOT RUN** by design.
- Automatic rollback rehearsal: **NOT RUN** because no deployment target was
  available. The workflow and restricted wrapper are syntax-validated and fail
  closed when policies/credentials are missing.
- Unrelated VPS applications, Nginx vhosts, PM2 processes, containers, and
  databases were not restarted or changed.

## Fully and partially integrated

No application is marked end-to-end production-ready because no staging
deployment or rollback rehearsal was authorized or possible. The two reference
applications are CI-integrated locally:

- Invoice Web: local typecheck/tests/build/Docker pass; lint and security gates
  still fail; staging/production remain unexecuted.
- Invoice Mobile: full local deterministic CI/export pass; EAS/Manual QA and
  store workflows remain unexecuted.

The remaining applications have central registry/workflow coverage, with the
exact local result or blocker recorded above and in
[`OPERIX-CICD-STATUS.md`](OPERIX-CICD-STATUS.md).

## Required remaining actions

1. Remove the two tracked `.env` files from source control, rotate any values
   that may have been exposed, and retain only safe examples.
2. Remediate the 37 high and 2 critical dependency advisories; do not weaken
   the audit gate.
3. Fix the Invoice Web lint error and Booking Web lint errors, then rerun all
   affected CI.
4. Resolve the four migration validator findings, run a fresh isolated
   Supabase reset/SQL test, and establish a verified backup/restore gate before
   any destructive production migration.
5. Commit/push the implementation, run `OperiX CI` on GitHub, and configure
   `main` protection to require the resulting `OperiX required CI` check.
6. Configure environment-scoped staging, QA, EAS, and restricted SSH secrets;
   provision the non-root deployment user, GHCR pull access, app policies, and
   PM2 incoming directories on a non-production target.
7. Deploy the reference Invoice Web artifact to staging, run external HTTPS
   smoke tests, and rehearse automatic/manual rollback. Record exact release
   metadata and status results.
8. Add an independent production reviewer and configure Environment branch
   restrictions after `main` protection exists.
9. Replace Scanner/Tracker EAS placeholders and run the existing mobile QA
   infrastructure with dedicated non-production fixtures.
10. Re-probe the newly added Suite/Booking/HR health endpoints only after a
    separately authorized non-production deployment.

Until these actions are complete, the correct suite state is `CI_FAILED` or
`PRODUCTION_APPROVAL_REQUIRED` depending on the gate, never `PRODUCTION_READY`.
