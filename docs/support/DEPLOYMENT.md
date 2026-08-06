# Deployment guide

## Target

Deploy the standalone product at `https://helpdesk.operixsuite.com` with two independent services:

- `operix-support-web` — Next.js standalone web service on internal port 3010, published only on host loopback port 3030.
- `operix-support-worker` — Node 22 worker with health endpoint on internal port 3011, published only on host loopback port 3031.

Neither service shares a process with Invoice. Mailcow is external and is not modified.

## Required configuration

Create a deployment-only `.env.support` from `apps/OperiX Support/.env.example`:

- Supabase URL, anon key, and service-role key.
- `SUPPORT_CREDENTIAL_KEY` — long random secret used for AES-256-GCM mailbox credentials.
- `SUPPORT_STORAGE_BUCKET`, `SUPPORT_MAX_ATTACHMENT_BYTES`, and `SUPPORT_WORKER_POLL_INTERVAL_MS`.

The service-role key and credential key are worker/server secrets and must never be sent to the browser.

## Migration

Review migration history drift first. Apply `20260806111345_operix_support_foundation.sql` with the approved Supabase CLI/project connection. Confirm the support bucket is private, RLS is enabled, and Support system roles are assigned through the existing RBAC administration workflow.

## Docker

From the repository root:

```bash
docker compose -f docker-compose.support.yml build --pull
docker compose -f docker-compose.support.yml up -d
curl -fsS https://helpdesk.operixsuite.com/api/health
curl -fsS http://127.0.0.1:3031/health
```

The web and worker containers log newline-delimited JSON. Both handle SIGTERM; the worker aborts IMAP/queue work before closing its health server.

## Reverse proxy and TLS

Terminate TLS at the existing edge/load balancer and proxy `helpdesk.operixsuite.com` to `127.0.0.1:3030`. Do not expose Supabase service credentials. Keep the worker health port private or allow it only from the container/orchestration network.

## Mailcow setup

Create or use standard IMAP/SMTP mailbox credentials in Mailcow. Enter them in Support Settings. Use IMAP 993/TLS and SMTP 587/STARTTLS unless the Mailcow deployment requires another standard protocol configuration. Support stores encrypted credentials and never changes Mailcow configuration.

## Rollback

Stop the two Support services and route the hostname to a maintenance page. Support migrations are additive; do not roll back by deleting tables. Preserve the ticket number ledger and delivery logs. Existing OperiX applications remain independently deployable.
