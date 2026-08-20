# Local Chatwoot

This directory provides an isolated local Chatwoot Community Edition deployment
for OperiX. It uses the official Chatwoot container, a pgvector/Postgres 16
database, Redis, and persistent Docker volumes.

## Start

From this directory:

```bash
./scripts/chatwoot.sh up
```

The first run creates a private `.env`, pulls the images, prepares the database,
and starts Chatwoot. Open <http://127.0.0.1:3040> and create the first admin
account through the onboarding screen.

After creating the first admin, set `ENABLE_ACCOUNT_SIGNUP=false` in `.env` and
restart the Rails service:

```bash
./scripts/chatwoot.sh restart
```

## Operations

```bash
./scripts/chatwoot.sh status
./scripts/chatwoot.sh logs
./scripts/chatwoot.sh down
./scripts/chatwoot.sh upgrade
```

`upgrade` uses the image tag in `.env`, runs the required Chatwoot database
preparation task, and restarts the services. Change `CHATWOOT_IMAGE` only as an
intentional version upgrade.

The Rails UI is bound to `127.0.0.1:3040`; Postgres and Redis are private to the
Compose network. Data lives in `operix-chatwoot-storage`,
`operix-chatwoot-postgres`, and `operix-chatwoot-redis` Docker volumes. `down`
does not remove them.

Outbound email is unset by default. Configure the SMTP variables in `.env`
before using invitations, password reset, or email inbox features.
