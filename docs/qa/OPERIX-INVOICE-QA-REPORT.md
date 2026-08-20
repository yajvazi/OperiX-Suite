# OperiX Invoice QA report

- App: OperiX Invoice
- Repository: `/root/OperiX`
- Path: `apps/OperiX Invoice/OperiX Invoice Mobile`
- Branch: `agent/phase-f-payroll`
- Commit tested: `6b99267abf9c420f495450dc105e0bc1dd823a0d`
- Run: `20260819124419-6e596a`
- Frameworks: Expo / React Native; Expo SDK 54; React Native 0.81.5
- Backend: Supabase / PostgreSQL (shared workspace)

## Automated results

| Check | Status | Evidence |
| --- | --- | --- |
| Environment | PASS | Node 22.22.0 (required major >= 20); npm 10.9.4 with repository packageManager npm@10.9.4; React Native 0.81.5; Expo SDK 54; Expo config app.json, app.config.js; iOS bundle identifier com.lrdygroup.operixinvoice; Android package com.internetkudo.invoiceapp; app scheme operix-invoice; slug invoice-app; version 1.0.0; native project mode: managed Expo (native folders not checked in); iOS simulator/build host: xcodebuild unavailable; Android host: adb unavailable |
| Dependencies | PASS | npm ci completed from package-lock.json. |
| Lint | PASS | lint completed. |
| TypeScript | PASS | typecheck completed. |
| Unit tests | PASS | test:unit completed. |
| React Native UI tests | PASS | test:component completed. |
| Legacy/domain tests | PASS | test:legacy completed. |
| Shared core tests | PASS | test:core completed. |
| Full application suite | PASS | test:ci completed. |
| Backend/API tests | ENVIRONMENT_FAILURE | Backend detected, but no live backend test command is declared. |
| Frontend/API-boundary integration tests | PASS | test:integration completed. |
| Database/Supabase tests | ENVIRONMENT_FAILURE | Supabase SQL test files discovered: invoice_customer_signatures.sql, operix_invoice_mobile_security.sql; Supabase CLI is not installed; no remote database calls were attempted. |
| Authentication tests | ENVIRONMENT_FAILURE | Authentication is detected, but dedicated QA accounts are not configured. |
| Security tests | ENVIRONMENT_FAILURE | Static mobile secret scan passed, but live authorization/RLS tests were not executed. |
| RLS/tenant isolation tests | ENVIRONMENT_FAILURE | Tenant signals were detected, but live cross-tenant SELECT/INSERT/UPDATE/DELETE/RPC checks were not executed. |
| Maestro/Detox E2E | ENVIRONMENT_FAILURE | Maestro flows exist, but the Maestro CLI is not installed in this environment; xcrun is also unavailable. |
| Visual regression | VISUAL_REVIEW_REQUIRED | No approved baseline screenshots exist for this app. Actual screenshots cannot be compared yet. |
| Performance sanity | PASS | Static sanity scan completed: 0 intervals, 55 effects, 158 API call sites. |
| Console/runtime capture | ENVIRONMENT_FAILURE | Runtime console capture requires the real-device E2E/debug session; no runtime claim was made from static code. |
| Build smoke test | PASS | build:check completed. |
| Expo development build | NOT_RUN | Development build was not started because critical automated gates remain unresolved. |

## Test counts

- Unit: 47/47
- UI: 27/27
- Backend: not reported by command
- Frontend/API-boundary integration: 3/3
- E2E: not reported by command
- Bugs found: 1
- Bugs fixed: 1
- Retry policy: max 2 bounded attempt(s) per repeated failure; no infinite fix loop
- Current failure attempts: backend 2/2, database 2/2, authentication 2/2, security 2/2, rls 2/2, e2e 2/2, visual 2/2, console 2/2, developmentBuild 2/2

## Blocking issues and failure classification

| Stage | Status | Classification | Diagnosis |
| --- | --- | --- | --- |
| backend | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | No real backend test command is declared. Frontend API-boundary mocks are reported separately and are not a live backend pass. |
| database | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | Install/configure a local or dedicated QA Supabase environment before claiming database or RLS coverage. |
| authentication | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | Run login, invalid login, expired/restored session, protected-route, and backend-token checks with non-production accounts. |
| security | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | Configure a dedicated QA Supabase environment, two isolated users/tenants, and run the app-specific security SQL suite. |
| rls | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | Run deterministic Tenant A/Tenant B tests against the dedicated QA database and verify actual resulting state. |
| e2e | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | The required command or executable is unavailable in this environment. |
| visual | VISUAL_REVIEW_REQUIRED | VISUAL_CHANGE_EXPECTED | Run the real-device screenshot flow, review baseline/actual/diff artifacts, then explicitly approve baselines. |
| console | ENVIRONMENT_FAILURE | ENVIRONMENT_FAILURE | Capture exceptions, unhandled rejections, functional React Native warnings, and network failures during simulator/manual preparation. |
| developmentBuild | NOT_RUN | ENVIRONMENT_FAILURE | Resolve the earlier blocking issues, then rerun the full app pipeline. |

## Visual differences

- Baseline policy: no automatic baseline approval
- Evidence: No approved baseline screenshots exist for this app. Actual screenshots cannot be compared yet.

## Build and Expo

- Build smoke: READY
- Development build: NOT_RUN
- Build details/location: /tmp Expo web export smoke build (not a release artifact)
- Expo Go: UNKNOWN — Not claimed until a real Expo Go launch is validated.
- Submission: disabled by design; no TestFlight or App Store action is performed by this pipeline.

## Final QA state

**BLOCKED**

The automated gate stops before manual QA approval. A human must inspect the app and explicitly record the manual-QA decision.
