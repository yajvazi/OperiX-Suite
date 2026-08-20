# Current OperiX deployment audit

Audit date: 2026-08-19 UTC  
Scope: `/root/OperiX`, relevant GitHub repositories, the local VPS, and
existing deployment tooling. No deployment or restart was performed during
this audit.

## Executive result

OperiX has working runtime infrastructure, but not a verified centralized CI/CD
system. Docker, PM2, Nginx, Supabase, CRM, Chatwoot, and the existing mobile QA
runner are active. They are mostly operated manually from the VPS and use
mutable local image tags or source directories. The canonical GitHub
repository has no workflow files on `origin/main`; the two existing local mobile
workflows are untracked in the current worktree.

## What exists and works

- GitHub CLI authentication is available for `yajvazi`; repository and workflow
  scopes are present. The canonical remote is `yajvazi/OperiX-Suite`.
- The local repository is a monorepo with npm workspaces, Turbo, web apps,
  Expo/React Native apps, Python Desk API code, Supabase migrations/functions,
  shared packages, and a central mobile QA runner.
- Docker is running. The observed OperiX containers were healthy at audit time:
  Invoice Web, Desk frontend, Desk backend, Suite Marketing, Help Center,
  Chatwoot, CRM, and the local Supabase stack.
- PM2 is running under `pm2-root.service` and currently manages OperiX Booking
  Web, OperiX HR Web, OperiX Control, and the Invoice Expo helper. It also
  manages unrelated InternetKudo applications.
- Nginx configuration validation passed:
  `nginx: configuration file /etc/nginx/nginx.conf syntax is ok` and
  `configuration file /etc/nginx/nginx.conf test is successful`.
- Existing Nginx vhosts route Suite, Invoice, Booking, Desk, HR, Control, Help
  Center, CRM, Chatwoot, and mail services independently. The current vhosts do
  not use a global `pm2 restart all` operation.
- Existing container health checks exist for Invoice Web, Suite Marketing, Help
  Center, and the Desk Compose stack.
- Existing application probes returned HTTP 200 for Invoice Web, Control, Desk,
  and Help Center health endpoints.
- `scripts/operix-mobile-qa.mjs` already records sanitized reports, preserves
  E2E/visual evidence, disallows service-role variables in mobile child
  processes, and never updates visual baselines during a normal run.
- CRM has isolated Compose services plus backup/restore/healthcheck scripts.
- `/opt/platform/deploy` is a restricted deployment platform for LRDY Group,
  IKDWEB, and Hidroterm. It has locks, SSH command allowlisting, immutable
  SHA-shaped references, Nginx validation, PM2 target selection, and a static
  rollback path. It is not configured for OperiX and was not repurposed.

## What is broken or incomplete

- `origin/main` has no `.github/workflows` tree. The only GitHub Actions run
  found was an older `CI` run on branch `phase12/cicd-foundation-20260804`; it
  failed in `Monorepo lint and build` and did not provide a successful baseline.
- The local `mobile-tests.yml` and `operix-mobile-qa.yml` are untracked and
  duplicate parts of the desired central platform. The mobile QA workflow uses
  `continue-on-error`, so an unsuccessful QA run cannot currently be a required
  release gate.
- The initial GitHub audit returned no repository secrets, repository variables,
  Environments, or main branch protection for `yajvazi/OperiX-Suite`. The
  implementation later created `staging`, `production`, `mobile-qa`, and
  `mobile-release`; `production` and `mobile-release` now have required
  reviewer protection with administrator bypass disabled, but no secrets or
  branch protection were added.
- No staging deployment target or staging credentials were discovered. A
  production deployment cannot be safely validated through GitHub Actions yet.
- Current web Docker Compose definitions use local/mutable image names such as
  `operix-invoice-web:latest` and dated build tags. No verified GHCR digest was
  found for the active OperiX images.
- The authenticated GitHub CLI lacks `read:packages`; the authenticated package
  API returned HTTP 403. The VPS file
  `/opt/platform/shared/secrets/ghcr-pull.env`, documented by the existing
  platform as the least-privilege pull credential, is absent. GHCR push/pull
  cannot be claimed as working.
- The existing `deploy` user is restricted to the non-OperiX platform allowlist.
  OperiX services are not covered by that wrapper. PM2 itself runs as root, so a
  new OperiX deployment must not grant ordinary GitHub Actions root SSH access.
- Public health probes returned 404 for `operixsuite.com/api/health`,
  `booking.operixsuite.com/api/health`, and `hr.operixsuite.com/api/health`.
  These applications need a safe health signal before they can be deployment
  gates.
- The shared Supabase directory has 132 migration files and 13 SQL test files.
  Thirty-nine migration filenames use legacy/non-timestamp naming, and the
  worktree contains duplicate timestamp versions. The Supabase CLI is not
  installed on the VPS audit environment, so a fresh zero-to-latest migration
  reset was not verified.
- No verified backup/restore capability for the shared OperiX Supabase data was
  found. CRM backup scripts are not a substitute for a shared application
  database backup gate.
- Tracked `.env` files were found in the canonical worktree for Invoice Mobile
  and HR Mobile. Their contents were not printed. This must be remediated before
  the required secret scan can pass on a branch containing those files.
- The Desk backend `requirements.txt` is UTF-16 encoded. CI must either normalize
  it in a temporary runner file or the source file must be converted before a
  normal `pip install -r` path can be considered portable.
- Scanner and Tracker EAS configuration still contains placeholder project IDs.
- Existing app release metadata, deployment history, current artifact identity,
  and rollback target are not maintained in a common machine-readable store.

## Current runtime map

| Surface | Runtime evidence | Verification |
|---|---|---|
| Suite Marketing | Docker `operix-operix-suite-1`, `127.0.0.1:3013 -> 3000` | Container healthy; public `/api/health` is 404 |
| Invoice Web | Docker `operix-operix-web-1`, `3006 -> 3000` | Container healthy; public `/api/health` is 200 |
| Desk frontend/API | Docker `operixdesk-frontend-1` and `operixdesk-backend-1`, ports 3007/8002 | Both healthy; public Desk health is 200 |
| Help Center | Docker `operix-help-center`, `3042 -> 3015` | Healthy; public health is 200 |
| Booking Web | PM2 `operix-booking-web`, port 3015 | Process online; public health is 404 |
| HR Web | PM2 `operix-hr-web`, port 3014 | Process online; public health is 404 |
| Control | PM2 `operix-control`, Nginx upstream 3016 | Process online; public health is 200 |
| CRM | Twenty server/worker/Redis/Postgres Compose stack | Containers healthy; dedicated `/healthz` script exists |
| Support | Chatwoot Rails/Sidekiq/Redis/Postgres Compose stack | Rails and Redis/Postgres healthy; no shared CI/CD |
| Supabase | Local Docker stack `supabase_*_OperiX` | Containers healthy; treated as production/stateful data and excluded from CI |

## Security and safety concerns

1. No production credentials were read or displayed. Existing env files were
   inspected only by filename, metadata, and variable-name policy.
2. PR workflows must not receive production secrets. QA credentials must be
   dedicated non-production values and scoped to the mobile QA environment.
3. Production deployment must use a restricted SSH command and a per-app lock;
   the existing unrelated `/opt/platform/deploy` allowlist is not a valid
   shortcut for OperiX.
4. Nginx must be checked with `nginx -t` before any reload. A deployment must
   never rewrite or reload unrelated vhosts.
5. Docker deployment must pull an exact digest and update only the target
   Compose service. `docker system prune -a` and global restarts are prohibited.
6. PM2 deployment must select one named process and preserve its previous
   release before reload. `pm2 restart all` is prohibited.
7. Destructive Supabase migrations require explicit review and a verified
   backup/restore gate. No backup gate is currently verified.

## Existing systems intentionally reused

- The monorepo npm workspace and Turbo structure remain the build source of
  truth.
- The mobile QA orchestrator and its Maestro/visual-baseline policy are called
  by the new workflows instead of being reimplemented.
- Existing Dockerfiles, Compose health checks, PM2 process names, Nginx vhosts,
  CRM scripts, and the Supabase migration/test directories remain the deployment
  contracts.
- The restricted deployment-user model from `/opt/platform/deploy` is used as
  the design reference, but no VPS user, sudoers rule, secret file, Nginx file,
  container, PM2 process, or production database was changed in this rollout.
