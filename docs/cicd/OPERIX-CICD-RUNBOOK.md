# OperiX CI/CD runbook

This runbook describes the centralized GitHub Actions platform in this
repository. Production deployment was not executed during the initial rollout.

## Architecture

The source of truth for application-specific behavior is
[`.github/operix-apps.json`](../../.github/operix-apps.json). Reusable workflows
read a JSON matrix produced by `scripts/cicd/affected-apps.mjs`; they do not
assume that every app uses the same framework.

| Workflow | Responsibility | Automatic trigger |
|---|---|---|
| `operix-ci.yml` | Detect affected apps and enforce required CI | PR to `main`, push to `main`, manual rerun |
| `operix-security.yml` | Registry validation, secret scan, npm audit | Called by `operix-ci` |
| `operix-web-build.yml` | Web lint/typecheck/tests/production build and Docker build validation | Called when affected web apps exist |
| `operix-mobile-build.yml` | Expo config, lint/typecheck/tests/export validation | Called when affected mobile apps exist |
| `operix-backend-test.yml` | Backend compile/tests, migration policy, isolated Supabase reset/pgTAP | Called when affected backend/database paths exist |
| `operix-release-artifacts.yml` | Build/push immutable GHCR images, package immutable PM2 archives, and write `release.json` | Successful `operix-ci` on `main`; manual artifact build from `main` |
| `operix-deploy-staging.yml` | Deploy a validated artifact through the restricted VPS wrapper and smoke test | Manual dispatch/call only during rollout |
| `operix-deploy-production.yml` | Approval-gated immutable production deployment and verification | Manual dispatch only |
| `operix-smoke-test.yml` | HTTPS health/render check | Called by staging/production workflows |
| `operix-rollback.yml` | Manual or automatic target-only rollback | Manual dispatch/call |
| `operix-mobile-qa.yml` | Reuses the existing OperiX mobile QA orchestrator | Manual dispatch |
| `operix-mobile-qa-build.yml` | Reuses central mobile CI, then creates an EAS preview/internal build | Manual dispatch |
| `operix-mobile-release.yml` | Separately approved production EAS build and optional TestFlight/Play upload | Manual dispatch only |

The normal web path is:

```text
PR -> affected-app CI -> security -> tests -> production build -> merge
  -> immutable artifact -> staging dispatch -> HTTPS smoke
  -> production environment approval + DEPLOY -> digest deployment
  -> HTTPS smoke -> automatic rollback if verification fails
```

The normal mobile path is:

```text
PR -> deterministic mobile CI -> central mobile QA dispatch
  -> EAS preview/internal build -> READY_FOR_MANUAL_QA
  -> human inspection -> MANUAL_QA_APPROVED
  -> separate mobile release workflow -> READY_FOR_TESTFLIGHT / store-internal
```

No workflow submits an app to App Store review.

## CI triggers and affected applications

`operix-ci.yml` runs for pull requests targeting `main`, pushes to `main`, and
manual reruns. The detector maps changed paths to the actual app registry:

- An app path runs only that app.
- `packages/**`, `supabase/**`, root workspace/lock files, and CI registry files
  fan out to all applicable consumers.
- `qa/mobile/**` and the mobile QA runner fan out to all mobile apps.
- Documentation-only changes do not create web/mobile/backend build matrices.
- CI/security policy changes intentionally fan out to all apps.

The `required` job is the branch-protection check to require once the first
workflow run has established its exact GitHub check name. A failed applicable
job fails `required`; skipped app matrices are allowed only when the detector
found no app of that type.

## Local validation

From the repository root:

```sh
node scripts/cicd/validate-cicd-config.mjs
node scripts/cicd/affected-apps.mjs --all
node scripts/cicd/validate-migrations.mjs
node scripts/cicd/security-scan.mjs
npm ci --ignore-scripts --no-audit --no-fund
```

The security scan intentionally fails when a real `.env` is tracked. Do not
weaken that gate; remove the tracked file, rotate any exposed values, and keep
only a safe `.env.example`.

## Staging deployment

1. Let `OperiX CI` pass on `main`.
2. Open the successful `OperiX Immutable Release Artifacts` run and record its
   run ID and the app artifact name.
3. Dispatch `OperiX Deploy Staging` with the app ID, release run ID, staging
   HTTPS URL, and exact confirmation `STAGING`.
4. The `staging` Environment must provide the restricted SSH secrets listed in
   [`GITHUB-SECRETS-REQUIREMENTS.md`](GITHUB-SECRETS-REQUIREMENTS.md).
5. Docker apps use a GHCR digest. PM2 apps use a commit-shaped archive plus
   SHA-256 digest; the workflow transfers the archive into the app-specific
   incoming directory before dispatch.
6. The remote command must be installed as `/opt/operix/deploy/dispatch` and
   must accept only the checked-in deployment contract.
7. The workflow downloads `release.json`, verifies app/commit/digest, invokes
   the target-only remote deploy, and runs the external smoke test.
8. If smoke verification fails, the workflow invokes rollback target `auto`,
   then verifies the rollback. It reports
   `DEPLOYMENT_FAILED_ROLLED_BACK` or `DEPLOYMENT_FAILED_ROLLBACK_FAILED`.

No staging target or credentials were present in the audit, so no staging
deployment was attempted during this rollout.

## Production deployment

Production is intentionally manual and approval-gated:

1. Use a successful immutable artifact from a successful `main` CI run.
2. Dispatch `OperiX Deploy Production` with the app ID, artifact run ID,
   production HTTPS URL, and exact confirmation `DEPLOY`.
3. The `production` Environment is configured with a required reviewer and
   administrator bypass disabled. Add an independent reviewer before release;
   the workflow also requires dispatch from `main`. Restrict the Environment to
   protected `main` once branch protection is established.
4. Only after Environment approval does the deployment job receive the
   production-scoped secrets and invoke the restricted remote command.
5. The workflow checks the process/container, the HTTPS health endpoint, and
   the public response. It never performs a financial, booking, payroll, or
   other customer-data mutation as a smoke test.
6. A failed external verification starts the automatic rollback path. The
   workflow remains failed even when rollback succeeds so the incident is
   visible.

There is no push/tag/schedule production trigger in the implementation.

## VPS deployment safety

The checked-in server contract is [the restricted deployment dispatcher](../../deploy/operix/README.md).
It must be installed separately by an operator after reviewing the current VPS
users and sudoers rules.

- Use a non-root deployment user and a forced SSH command.
- Validate the exact image/archive digest before pulling or extracting.
- Use a generated Compose override for one Docker service only.
- Use `pm2 startOrReload --only <target>` for PM2 apps.
- Preserve the current release/artifact before switching.
- Run `nginx -t` before any reload; never rewrite unrelated vhosts.
- Use an app-specific `flock`; staging cancels stale jobs, production never
  cancels an active deployment.
- Do not use `docker system prune -a`, `pm2 restart all`, or broad stack restarts.

The current `/opt/platform/deploy` implementation remains dedicated to its
existing LRDY/IKDWEB/Hidroterm allowlist and is not modified by this platform.

## Mobile QA and release

`operix-mobile-qa.yml` invokes the existing `scripts/operix-mobile-qa.mjs`
runner. It preserves sanitized logs/reports, Maestro artifacts, visual diffs,
and the existing policy that baselines are never automatically updated. The
full QA workflow uses only dedicated `OPERIX_QA_*` credentials and must not use
the VPS Supabase instance or production data.

Dispatch `operix-mobile-qa-build.yml` with a mobile app and `BUILD_QA`. It first
calls the reusable mobile CI workflow, then creates an EAS `preview` build and
reports `READY_FOR_MANUAL_QA`. A human must inspect that build and record the
existing QA runner's `MANUAL_QA_APPROVED` state before dispatching
`operix-mobile-release.yml` with `RELEASE`.

The mobile release workflow can build iOS/Android production profiles. Upload to
TestFlight or a Google Play internal track requires an additional explicit
destination and `publish=true`. It does not submit to App Store review or
publicly publish Android releases.

## Database and migration gates

- PR CI never connects to the VPS Supabase stack or a production database.
- A database-affecting change runs `validate-migrations.mjs` and, when
  `supabase/**` changed, the Supabase CLI reset/pgTAP job against a fresh local
  Docker database.
- Migration syntax/order/duplicates must be fixed before a required gate can
  pass. Legacy filenames are reported rather than silently reordered.
- Potentially destructive SQL is reported for explicit review.
- Production migration deployment remains a separate operation. Without a
  verified backup and restore test, destructive migration deployment is
  blocked.

## Troubleshooting

| Symptom | First checks |
|---|---|
| No app build ran | Inspect the affected-app artifact and check whether the change was documentation-only or matched a shared path |
| CI security failed | Read the sanitized security artifact; remove tracked `.env` files and remediate high/critical npm advisories |
| Web build failed | Re-run the app workspace command locally; confirm lockfile and production build rather than relying on unit tests |
| Mobile CI failed | Check Expo config, TypeScript, app-declared scripts, and the uploaded export evidence |
| Mobile QA is blocked | Confirm dedicated QA Supabase accounts/fixtures; missing environment is not a QA pass |
| Migration job failed | Run `node scripts/cicd/validate-migrations.mjs`; never point CI at production |
| GHCR publication failed | Check repository Actions package permission and exact package namespace; do not weaken permissions |
| Staging/prod deploy failed before SSH | Confirm Environment secrets, non-root user, pinned known hosts, and installed remote wrapper |
| Health check failed | Check target-only container/PM2 status, public HTTPS route, and Nginx config with `nginx -t` |
| Rollback failed | Preserve the failed release metadata and remote state; use manual rollback with a retained exact artifact after access is restored |

## Adding a future OperiX application

1. Add the app in `.github/operix-apps.json` with its type, path, framework,
   runtime, backend, workspace, applicable command names, health path, Docker
   file/artifact repository, and deployment kind.
2. Add a safe health endpoint and expose only commit/build metadata, never
   secrets.
3. Add app-specific package scripts where the architecture has them. Do not
   invent a test command that does not exist; leave it `null` and record the
   missing coverage in the status report.
4. Add only the app policy file needed by the restricted VPS wrapper. Do not
   reuse another app's PM2 name, Compose service, port, database, or secret.
5. Add the staging/production public URLs and environment secrets after a
   non-production target is verified.
6. Run the config validator, affected-app detector, security scan, app tests,
   production build, and staging smoke/rollback rehearsal before marking the
   app fully integrated.

No new per-app workflow file should be necessary for a standard npm, Expo,
Docker, or PM2 application.
