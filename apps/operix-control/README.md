# OperiX Control

OperiX Control is the web administration console for the shared OperiX account, organization, roles, application entitlements, access assignments, integrations metadata, security visibility, and administrative audit stream.

## Local development

1. Apply the Supabase migrations, including the existing `2026081318*`/`2026081319*` Control migrations and the operational-plane migrations from `20260813200000` through `20260813208000`.
2. Copy `.env.example` to the environment used by the web app and provide the shared Supabase URL and publishable key.
3. Run `npm run dev:control` from the repository root, or `npm run dev --workspace=operix-control` from this directory.

Control uses the existing OperiX Auth session. The server layout and `control.access` permission gate entry; the database wrappers and RLS policies enforce tenant and privilege boundaries for data operations.

## Deployment notes

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the browser-safe publishable key. Never provide a Supabase service-role key to this app.
- Configure the app URLs per environment. Local/staging values should not point at production credentials or services.
- Run the Control security regression SQL at `supabase/tests/operix_control_security.sql` after migrations.
- The operational-plane migrations expose tenant-scoped contracts for users, teams, roles, app entitlements/access, notifications, security policy, domains, measured usage/storage, integrations, API keys, webhooks, billing snapshots, feature flags, retention policy, and the internal platform-admin boundary.
- API keys and webhook signing secrets are stored as hashes or Vault references; the browser only receives a one-time secret at creation/rotation. Billing snapshot writes are restricted to the server-side service role.
- Billing and health views show only data backed by an existing subscription snapshot or health endpoint. Product-specific settings remain owned by their source application and are linked from Control rather than duplicated.
- The production deployment uses the shared OperiX Supabase public configuration and runs behind the `control.operixsuite.com` reverse proxy. Do not commit environment files or secrets.
