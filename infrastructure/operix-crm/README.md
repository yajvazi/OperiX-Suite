# OperiX CRM infrastructure

This directory runs a self-hosted Twenty CRM instance for OperiX CRM. It is
intentionally isolated from the OperiX Invoice/Supabase database:

- Postgres uses `operix-crm-db-data`.
- Redis uses `operix-crm-redis-data`.
- Twenty local storage uses `operix-crm-server-local-data`.
- All services communicate over the internal `operix-crm-internal` network.
- Only the Twenty server is bound to `127.0.0.1`; public HTTPS belongs in the
  existing host reverse proxy.

## Start

```bash
cp .env.example .env
chmod 600 .env
# Edit .env and replace every placeholder.
docker compose config
docker compose up -d
./scripts/healthcheck.sh
```

The image is pinned to `v2.8.5`. Update it only through the documented upgrade
runbook after a backup and staging validation.

## Environment safety

`.env` is deliberately ignored by the repository. Store the real file in the
host's secret/configuration management system, restrict it to the deployment
operator, and rotate `ENCRYPTION_KEY` using Twenty's supported key rotation
procedure. Losing the encryption key makes encrypted Twenty secrets unreadable.

## Reverse proxy

Use the reviewed example in `reverse-proxy/README.md` as an operator change to
the existing host proxy. Do not expose port 3020 directly or replace the
current proxy configuration wholesale.
