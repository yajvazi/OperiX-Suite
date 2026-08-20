# GitHub Actions secrets and environments

Audit date: 2026-08-19 UTC

The initial GitHub API audit returned no repository secrets, variables, or
environments for `yajvazi/OperiX-Suite`. No secret values were read or printed.
The implementation created the four named Environments below. `production` and
`mobile-release` have a required reviewer (`yajvazi`) and administrator bypass
disabled; `prevent_self_review` is not enabled because the available account is
also the only discovered repository administrator. Add an independent reviewer
before a real release. No environment secrets have been configured.

## Environment policy

| Environment | Use | Pull request access | Required protection |
|---|---|---|---|
| `staging` | Non-production deployment, health checks, smoke tests | No production credentials; dedicated staging values only | Environment-scoped deploy secrets; optional reviewers during rollout |
| `production` | Manual production deployment and rollback | Never exposed to PR workflows | Required reviewers, prevent self-review where available, and deployment branch restriction to `main` |
| `mobile-qa` | Dedicated QA accounts and non-production Supabase | Only manual/specially authorized QA workflows | Environment-scoped QA secrets; no production database or service-role key in mobile processes |
| `mobile-release` | EAS production builds and optional TestFlight/Google Play upload | Never exposed to PR workflows | Required reviewers and exact manual confirmation |

## Staging and production deployment secrets

Configure these as environment secrets, not repository-wide secrets:

| Name | Required by | Purpose |
|---|---|---|
| `VPS_HOST` | staging/production/rollback | Deployment host name or address |
| `VPS_PORT` | staging/production/rollback | SSH port |
| `VPS_DEPLOY_USER` | staging/production/rollback | Restricted deployment user, never `root` |
| `VPS_DEPLOY_SSH_KEY` | staging/production/rollback | Dedicated SSH private key; use a forced command or restricted key where possible |
| `VPS_KNOWN_HOSTS` | staging/production/rollback | Pinned host key material; do not disable host verification |
| `OPERIX_STAGING_BASE_URL` | staging smoke tests | Staging public HTTPS base URL |
| `OPERIX_PRODUCTION_BASE_URL` | production smoke tests | Production public HTTPS base URL |

The remote host must expose one fixed command such as
`/opt/operix/deploy/dispatch` to the restricted user. The workflow never accepts
an arbitrary SSH command. The wrapper must use per-environment/per-app locks,
exact image/archive digests, target-only Docker/PM2 operations, `nginx -t`
before reload, release metadata, and rollback state. PM2 apps additionally need
an app-specific writable incoming directory such as
`/opt/operix/incoming/<app>` for the restricted deployment user; it must not be
a general-purpose writable VPS directory.

## GHCR

The release workflow uses the repository `GITHUB_TOKEN` with `packages: write`
only in the artifact-publishing job. Test jobs remain read-only. The VPS must
use a separate least-privilege package-read credential or an equivalent approved
OIDC/token design. Do not put a package-read token in source or a PR workflow.

The current audit found no verified GHCR package access and no verified VPS pull
credential. Until both are validated with an exact digest pull, the production
workflow must remain not-ready.

## Mobile QA and EAS

Configure these only on `mobile-qa` or `mobile-release` as applicable:

| Name | Purpose |
|---|---|
| `OPERIX_QA_SUPABASE_URL` | Dedicated non-production QA Supabase URL |
| `OPERIX_QA_SUPABASE_ANON_KEY` | Dedicated QA publishable/anon key |
| `OPERIX_QA_TENANT_A_USER` | Deterministic tenant-isolation test account A |
| `OPERIX_QA_TENANT_B_USER` | Deterministic tenant-isolation test account B |
| `OPERIX_QA_E2E_EMAIL` | Existing Maestro account |
| `OPERIX_QA_E2E_PASSWORD` | Existing Maestro account password |
| `OPERIX_QA_E2E_SUPABASE_URL` | Existing Maestro QA Supabase URL |
| `OPERIX_QA_E2E_CUSTOMER_ID` | Non-production fixture ID |
| `OPERIX_QA_E2E_PRODUCT_ID` | Non-production fixture ID |
| `OPERIX_QA_E2E_CUSTOMER_NAME` | Optional fixture display value |
| `OPERIX_QA_E2E_CUSTOMER_EMAIL` | Optional fixture display value |
| `OPERIX_QA_E2E_PRODUCT_NAME` | Optional fixture display value |
| `EXPO_TOKEN` | EAS authentication for development/store builds |

Mobile workflows must not expose or pass a Supabase service-role key to an Expo
application. Any backend service-role use belongs in a protected server-side
job and must be separately reviewed.

## TestFlight and Android release credentials

Only configure these after manual QA has recorded `MANUAL_QA_APPROVED`:

- iOS/TestFlight: `ASC_API_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY` (or the
  equivalent EAS-managed credential contract), and `EXPO_TOKEN`.
- Android: `GOOGLE_SERVICE_ACCOUNT_JSON` or the approved EAS-managed Android
  credential contract, plus `EXPO_TOKEN`.

The workflows do not submit an app to App Store review. Store upload is a
separate manually dispatched, approval-gated action.

## Database and backup gates

No production database credential is required for PR CI. Local Supabase reset
and SQL tests use an isolated disposable database. Before a potentially
destructive production migration, configure a protected backup verification
operation in the deployment wrapper. If backup creation and restore validation
cannot be demonstrated, the migration must be blocked.

## Rotation and logging rules

- Mask all secret values in Actions logs; never print complete env files.
- Use environment-scoped secrets, not broad repository secrets, for staging,
  production, QA, and mobile release operations.
- Rotate the deployment key and QA credentials independently.
- Do not upload `.env`, service-role keys, EAS credential files, or complete
  production configuration as Actions artifacts.
