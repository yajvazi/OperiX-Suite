# OperiX CI/CD status

This is the suite-level status ledger for the centralized platform. It reports
actual repository/runtime evidence; `configured` does not mean that a GitHub
run or deployment has already succeeded.

Audit/implementation baseline: 2026-08-19 UTC  
Production deployment policy: disabled for this rollout; manual approval remains
mandatory in the production workflow.

| App | Type | CI | Tests | Build | Staging | Production | Rollback | Status |
|---|---|---|---|---|---|---|---|---|
| OperiX Suite Marketing | WEB | Central workflow configured | Lint/typecheck; no test script discovered | Next build passed locally; Docker validation configured | Workflow configured; no staging target/secrets verified | Manual approval workflow; environment reviewer configured; not run | Workflow/remote wrapper contract configured; not rehearsed | PARTIAL — source health route added; current live endpoint was 404 |
| OperiX Invoice Web | WEB | Central workflow configured | Typecheck + 29 Vitest tests passed; lint has 1 existing error | Next build and local Docker image passed | Workflow configured; no staging target/secrets verified | Manual approval workflow; environment reviewer configured; not run | Workflow/remote wrapper contract configured; live rollback not rehearsed | REFERENCE WEB — build/container pass; CI blocked by lint/security gates |
| OperiX Invoice Mobile | MOBILE | Central mobile workflow configured | Full local CI passed: 8 legacy, 13 core, 47 unit, 35 UI, 3 integration | Expo web export passed (2,538 modules) | QA workflow available; EAS token/QA target not configured | Manual TestFlight/Play workflow; not run | Store-operation concern; no automatic submission | REFERENCE MOBILE — local validation pass; manual QA not run |
| OperiX Booking Web | WEB | Central workflow configured | Lint fails: 9 errors, 11 warnings; Vitest not run | Next production build passed with CI placeholders | PM2 artifact/staging workflow configured; VPS policy/target absent | Manual approval workflow; not run | PM2 archive/rollback contract configured; not rehearsed | BLOCKED — existing lint errors and worktree-only source |
| OperiX Booking Mobile | MOBILE | Central mobile workflow configured | TypeScript; no app test script discovered | Expo export configured; not locally run | QA build workflow available | Manual release only; not run | Store-operation concern | PARTIAL — worktree-only; EAS target not verified |
| OperiX Desk Web | WEB | Central workflow configured | Lint; no typecheck/test script discovered | Vite + Docker validation configured | Docker staging workflow configured; target/secrets absent | Manual approval workflow; not run | Digest rollback contract configured; not rehearsed | PARTIAL — current container healthy |
| OperiX Desk API | API / BACKEND | Central backend workflow configured | Python compile passed; no isolated pytest suite discovered | Docker image build passed after UTF-16 normalization; immutable Docker release configured | Target-only staging workflow configured; target/secrets absent | Manual approval workflow; not run | Digest rollback contract configured; not rehearsed | PARTIAL — DB gates blocked |
| OperiX Desk Mobile | MOBILE | Central mobile workflow configured | TypeScript; central QA dispatch | Expo export configured; not locally run | QA build workflow available | Manual release only; not run | Store-operation concern | PARTIAL — worktree-only |
| OperiX HR Web | WEB | Central workflow configured | Lint passed with 1 warning; no test script discovered | Next production build passed with CI placeholders | PM2 artifact/staging workflow configured; VPS policy/target absent | Manual approval workflow; not run | PM2 archive/rollback contract configured; not rehearsed | PARTIAL — source health route added; current live endpoint was 404 |
| OperiX HR Mobile | MOBILE | Central mobile workflow configured | TypeScript; central QA dispatch | Expo export configured; not locally run | QA build workflow available | Manual release only; not run | Store-operation concern | BLOCKED — tracked `.env` remediation required |
| OperiX Control | WEB | Central workflow configured | Lint/typecheck/Vitest configured; not locally run | Next build configured | PM2 artifact/staging workflow configured; VPS policy/target absent | Manual approval workflow; not run | PM2 archive/rollback contract configured; not rehearsed | PARTIAL — worktree-only |
| OperiX Help Center | STATIC_SITE | Central workflow configured | Lint/typecheck/Vitest/Playwright contract configured; not locally run | Next build + Docker validation configured | Workflow configured; no staging target/secrets verified | Manual approval workflow; not run | Digest rollback contract configured; not rehearsed | PARTIAL — worktree-only; current health verified |
| OperiX Scanner | MOBILE | Central mobile workflow configured | TypeScript; central QA dispatch | Expo export configured; not locally run | QA build workflow available | Manual release only; EAS project placeholder | Store-operation concern | BLOCKED — placeholder EAS project |
| OperiX Tracker | MOBILE | Central mobile workflow configured | TypeScript; central QA dispatch | Expo export configured; not locally run | QA build workflow available | Manual release only; EAS project placeholder | Store-operation concern | BLOCKED — placeholder EAS project |
| OperiX Supabase / PostgreSQL | BACKEND | Migration/security workflow configured | Fresh local reset/SQL test contract configured; not run due migration blockers | N/A | Migration gate required before app staging | Destructive migration approval + verified backup required | No verified database rollback | BLOCKED — 4 invalid/duplicate migration findings and no verified backup |
| OperiX CRM | SERVICE | Not integrated into application workflow | Existing health/backup scripts | Vendor image | Existing manual runbook | Manual isolated upgrade only | Existing backup/restore runbook | OUT OF CENTRAL APP CI — preserved |
| OperiX Support / Chatwoot | SERVICE | Not integrated into application workflow | Vendor/service checks only | Vendor image | Existing manual Compose path | Manual isolated upgrade only | Volume backup/restore runbook | OUT OF CENTRAL APP CI — preserved |

## State model

Web states are `CI_PENDING`, `CI_FAILED`, `CI_PASSED`, `BUILDING`,
`BUILD_FAILED`, `STAGING_DEPLOYING`, `STAGING_FAILED`, `STAGING_READY`,
`PRODUCTION_APPROVAL_REQUIRED`, `PRODUCTION_DEPLOYING`, `PRODUCTION_READY`,
`DEPLOYMENT_FAILED`, and `ROLLED_BACK`.

Mobile states are `CI_PENDING`, `CI_FAILED`, `QA_RUNNING`, `QA_FAILED`,
`BUILDING`, `BUILD_FAILED`, `READY_FOR_MANUAL_QA`, `MANUAL_QA_FAILED`,
`MANUAL_QA_APPROVED`, `READY_FOR_TESTFLIGHT`, `TESTFLIGHT_BUILDING`, and
`TESTFLIGHT_READY`.

The workflows write the state to the job summary and release metadata. No state
is marked successful merely because a process started; health and smoke checks
are required.
