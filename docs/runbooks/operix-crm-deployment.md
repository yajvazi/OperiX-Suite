# OperiX CRM deployment runbook

1. Provision a host or isolated deployment target with Docker Compose, at least
   the resources required by the pinned Twenty release, and a private backup
   location.
2. Copy `infrastructure/operix-crm/.env.example` to `.env`, replace all
   placeholders, set `chmod 600`, and store the file outside Git.
3. Create `ENCRYPTION_KEY` with `openssl rand -base64 32`. Keep it with the
   backup/recovery material.
4. Run `docker compose config` and confirm `TWENTY_TAG` is an exact release.
5. Start the isolated project and run `scripts/healthcheck.sh`.
6. Add the reviewed `crm.operixsuite.com` proxy block to the existing proxy,
   validate its configuration, and reload it safely.
7. Configure Twenty's first workspace, API key, role scope, and webhook URL
   (`/api/webhooks/twenty`) in staging first.
8. Configure the Invoice environment with the server-only API key, webhook
   secret, service-role key, and flags all disabled.
9. Apply the Supabase migration through the repository's normal migration
   workflow, inspect RLS, and test a non-member read.
10. Enable flags in staging in this order: CRM enabled, webhooks enabled,
    customer sync enabled only after link tests. Keep draft creation false.

Production deployment is intentionally manual; this repository contains no
safe automatic production workflow for the CRM host.
