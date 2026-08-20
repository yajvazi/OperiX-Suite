# OperiX application inventory

Audit date: 2026-08-19 UTC  
Canonical checkout: `/root/OperiX`  
Canonical remote: `yajvazi/OperiX-Suite` (`https://github.com/yajvazi/OperiX-Suite`)  
Audit commit: `6b99267abf9c420f495450dc105e0bc1dd823a0d` on `agent/phase-f-payroll`

This inventory is based on the local worktree, GitHub repository trees, running
Docker/PM2 services, Nginx configuration, and existing OperiX documentation. A
row marked `worktree-only` exists in the checkout but was not present on
`origin/main` at audit time. It is included so the CI platform can cover the
actual current worktree without treating uncommitted code as a verified remote
release.

## Verified applications and services

| Application | Type | Repository | Path | Framework | Runtime | Backend | Current Deployment | CI | CD |
|---|---|---|---|---|---|---|---|---|---|
| OperiX Suite Marketing | WEB | `yajvazi/OperiX-Suite` | `apps/OperiX Suite` | Next.js | Node.js 22 | Public Next.js app; optional CRM link | Docker `operix-operix-suite-1`, loopback port 3013; Nginx `operixsuite.com`; existing `/api/health` was 404 | Central affected-app CI configured locally; not yet on `origin/main` | Immutable GHCR workflow + target-only Docker staging/production workflow configured; no target/credentials verified |
| OperiX Invoice Web | WEB | `yajvazi/OperiX-Suite` | `apps/OperiX Invoice/OperiX Web` | Next.js | Node.js 22 | Supabase/PostgreSQL, API routes, Chromium PDF support | Docker `operix-operix-web-1`, port 3006; Nginx `invoice.operixsuite.com`; `/api/health` returned 200 | Central CI configured locally; typecheck/tests/build passed; lint has one existing error | Immutable GHCR workflow + target-only Docker staging/production workflow configured; no target/credentials verified |
| OperiX Invoice Mobile | MOBILE | `yajvazi/OperiX-Suite` | `apps/OperiX Invoice/OperiX Invoice Mobile` | Expo / React Native | Node.js 20, Expo/EAS | Supabase/PostgreSQL | PM2 `operix-invoice-expo` service is running; this is not a verified store release | Central mobile CI + existing QA runner dispatch configured locally; full local CI passed | EAS QA/release workflows configured; no TestFlight/Google Play release executed |
| OperiX Booking Web | WEB | `yajvazi/OperiX-Suite` | `apps/OperiX Booking/OperiX Booking Web` | Next.js | Node.js 20/22 | Supabase/PostgreSQL | Worktree-only; PM2 `operix-booking-web`, port 3015; Nginx `booking.operixsuite.com`; public `/api/health` was 404 | Central CI configured locally; build passed; lint fails with 9 existing errors | Immutable PM2 archive + target-only staging/production workflow configured; no server policy/credentials verified |
| OperiX Booking Mobile | MOBILE | `yajvazi/OperiX-Suite` | `apps/OperiX Booking/OperiX Booking Mobile` | Expo / React Native | Node.js 20, Expo/EAS | Supabase/PostgreSQL | Worktree-only; PM2 Expo helper is stopped; no release verified | Central mobile CI configured locally; TypeScript/build declared; no local full run | EAS QA/release workflows configured; no store release verified |
| OperiX Desk Web | WEB | `yajvazi/OperiX-Suite` | `apps/OperiX Desk/frontend` | Vite / React | Node.js 22 | FastAPI Desk API and Supabase | Docker `operixdesk-frontend-1`, loopback port 3007; Nginx `desk.operixsuite.com`; healthy | Central CI configured locally; lint/build declared | Immutable GHCR workflow + target-only Docker staging/production workflow configured; no target/credentials verified |
| OperiX Desk API | API / BACKEND | `yajvazi/OperiX-Suite` | `apps/OperiX Desk/backend` | FastAPI / SQLAlchemy | Python 3.13 | Supabase/PostgreSQL | Docker `operixdesk-backend-1`, loopback port 8002; Nginx `/api`; `/api/health` returned 200 | Central backend CI configured locally; compile passed; UTF-16 requirements normalized in CI | Immutable GHCR workflow + target-only Docker staging/production workflow configured; migration/backup gates unresolved |
| OperiX Desk Mobile | MOBILE | `yajvazi/OperiX-Suite` | `apps/OperiX Desk/OperiX Desk Mobile` | Expo / React Native | Node.js 20, Expo/EAS | Desk API and Supabase/PostgreSQL | Worktree-only; no mobile release verified | Central mobile CI configured locally; TypeScript/build declared; no local full run | EAS QA/release workflows configured; no store release verified |
| OperiX HR Web | WEB | `yajvazi/OperiX-Suite` | `apps/operix-hr-web` | Next.js | Node.js 20/22 | Supabase/PostgreSQL | Worktree-only; PM2 `operix-hr-web`, port 3014; Nginx `hr.operixsuite.com`; public `/api/health` was 404 | Central CI configured locally; build/lint passed with one warning | Immutable PM2 archive + target-only staging/production workflow configured; no server policy/credentials verified |
| OperiX HR Mobile | MOBILE | `yajvazi/OperiX-Suite` | `apps/hr-app` | Expo / React Native | Node.js 20, Expo/EAS | Supabase/PostgreSQL | No mobile deployment verified | Central mobile CI configured locally; tracked `.env` blocks security gate | EAS QA/release workflows configured; no store release verified |
| OperiX Control | WEB | `yajvazi/OperiX-Suite` | `apps/operix-control` | Next.js | Node.js 20/22 | Supabase/PostgreSQL and product health probes | Worktree-only; PM2 `operix-control`, Nginx `control.operixsuite.com`; `/api/health` returned 200 | Central CI configured locally; lint/typecheck/test/build declared | Immutable PM2 archive + target-only staging/production workflow configured; no server policy/credentials verified |
| OperiX Help Center | STATIC_SITE | `yajvazi/OperiX-Suite` | `apps/OperiX Help Center` | Next.js / content site | Node.js 22 | Static/content routes plus health API | Worktree-only; Docker `operix-help-center`, loopback port 3042; Nginx `helpdesk.operixsuite.com`; `/api/health` returned 200 | Central CI configured locally; lint/typecheck/test/build declared | Immutable GHCR workflow + target-only Docker staging/production workflow configured; no target/credentials verified |
| OperiX Scanner | MOBILE | `yajvazi/OperiX-Suite` | `apps/OperiX Scanner` | Expo / React Native | Node.js 20, Expo/EAS | Supabase/PostgreSQL | No release verified; EAS project ID remains placeholder `YOUR_SCANNER_PROJECT_ID` | Central mobile CI configured locally; TypeScript/build declared | EAS QA/release workflows configured but release configuration is incomplete |
| OperiX Tracker | MOBILE | `yajvazi/OperiX-Suite` | `apps/OperiX Tracker` | Expo / React Native | Node.js 20, Expo/EAS | Supabase/PostgreSQL | No release verified; EAS project ID remains placeholder `YOUR_TRACKER_PROJECT_ID` | Central mobile CI configured locally; TypeScript/build declared | EAS QA/release workflows configured but release configuration is incomplete |
| OperiX Supabase / PostgreSQL | BACKEND | `yajvazi/OperiX-Suite` | `supabase/` | Supabase CLI, PostgreSQL 17 | Docker Supabase stack | Auth, REST, Realtime, Storage, Edge Functions, RLS, migrations | VPS local stack `supabase_*_OperiX` is healthy; production data is present and must never be used by CI | Migration/security workflow configured locally; 132 migrations and 13 SQL test files discovered; validator currently fails | Manual migration/deployment; no verified backup gate or automatic migration rollback |
| OperiX Shared API and Edge Functions | API | `yajvazi/OperiX-Suite` | `packages/api`, `supabase/functions` | TypeScript / Supabase Edge Functions | Node/Deno depending on target | Supabase/PostgreSQL | Shared by web/mobile apps; no independent deployment target verified | Covered by affected-app fan-out in the new platform | No independent CD target verified |
| OperiX Shared Packages | SHARED_PACKAGE | `yajvazi/OperiX-Suite` | `packages/*` | TypeScript/npm workspaces | Node.js 20/22 | N/A; consumed by applications | Not deployed independently | Changes fan out to dependent applications | N/A |
| OperiX Mobile QA | INTERNAL_TOOL | `yajvazi/OperiX-Suite` | `scripts/operix-mobile-qa.mjs`, `qa/mobile`, `docs/qa` | Node.js test orchestrator, Maestro policy | Node.js 20; macOS simulator for E2E | Dedicated QA Supabase environment required for security/RLS tests | Repository QA runner and generated dashboard exist; no external QA service verified | Existing workflow calls the runner but currently allowed failure | N/A; development builds are separate from store release |
| OperiX CRM | SERVICE | `yajvazi/OperiX-Suite` | `infrastructure/operix-crm` | Self-hosted Twenty CRM v2.8.5 | Docker | Isolated CRM PostgreSQL and Redis | Docker `operix-crm-server-1`, `crm.operixsuite.com`, health script `/healthz`; healthy | No application CI in canonical repo | Manual isolated Compose upgrade with backup/restore scripts |
| OperiX Support / Chatwoot service | SERVICE | `yajvazi/OperiX-Suite` | `infrastructure/chatwoot`; legacy web source under `apps/OperiX Support` | Chatwoot CE v4.16.2; legacy Next.js source is not current | Docker | Isolated Chatwoot PostgreSQL and Redis; Support tables use Supabase | Docker `operix-chatwoot-rails`, Nginx `chat.operixsuite.com`; legacy Support web source is deleted in the current worktree | No canonical CI/CD; current Chatwoot workflow is infrastructure-only/manual | Manual Compose; no shared OperiX promotion/rollback workflow |

## GitHub repository discovery

Relevant repositories visible to the authenticated GitHub account:

| Repository | Finding | CI/CD treatment |
|---|---|---|
| `yajvazi/OperiX-Suite` | Public canonical monorepo; local checkout at `/root/OperiX` | In scope for this implementation |
| `yajvazi/OperiX` | Private older/parallel monorepo containing `invoice-app`, HR, Scanner, Tracker, web-suite, and an older package set | Audited as legacy/parallel; not modified because no local checkout is available |
| `yajvazi/invoice-app` | Private invoice repository; local canonical checkout has it as an upstream remote under `internetkudo-dev/invoice-app` | Audited as legacy/upstream; not modified |

The other visible repositories (`IKDWEB`, `IKDBWEB`, `IKDAPP`,
`internetkudo-backend`, `feneri-web`, `LRDY-WEB`, and unrelated projects) were
not treated as OperiX products and were not modified.

`/root/OperiX-phase-0a-documents` is a linked worktree for the same repository
and commit, not a separate product repository.

## Shared package inventory

The verified shared workspace packages are `api`, `accounting`, `booking`,
`commercial-documents`, `compliance`, `context`, `desk-api`, `desk-types`,
`fiscalization`, `hooks`, `hr`, `i18n`, `invoice-template`, `money`,
`notifications`, `offline-pos`, `operix-ui`, `payroll`, `report-templates`,
`support`, `types`, and `ui`. A change under `packages/**`, `supabase/**`, the
root lockfile, or the central CI configuration fans out to all applicable
consumers rather than silently bypassing dependent application checks.

## Inventory limitations

The current checkout contains substantial uncommitted application work. A
worktree-only row is therefore not a claim that the corresponding app is
already merged, release-ready, or production-approved. The implementation
report records local validation and GitHub/VPS validation separately.
