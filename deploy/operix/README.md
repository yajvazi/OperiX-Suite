# OperiX restricted deployment command

`operix-deploy-dispatch` is the server-side contract used by the staging,
production, and rollback workflows. It is intentionally checked into the
repository but was not installed or executed on the VPS during the initial
CI/CD rollout.

## Required server installation

An operator must install it root-owned at a fixed path such as
`/opt/operix/deploy/dispatch`, create root-owned app policy files under
`/etc/operix/deploy/apps.d`, and add a narrowly scoped sudo/forced-command rule
for a non-root deployment user. The SSH key must not allow an arbitrary shell.

Each policy file must define only the target service contract, for example:

```sh
APP_ID=operix-invoice-web
APP_KIND=docker
PUBLIC_HEALTH_URL=https://staging.example.invalid/api/health
ARTIFACT_REPOSITORY=ghcr.io/yajvazi/operix-invoice-web
COMPOSE_PROJECT=operix
COMPOSE_FILE=/srv/operix/docker-compose.web.yml
COMPOSE_SERVICE=operix-web
DOCKER_CONTAINER=operix-operix-web-1
RELOAD_NGINX=0
```

PM2 policies additionally define `PM2_PROCESS`, `PM2_RELEASE_ROOT`, and either
an archive-provided `PM2_ECOSYSTEM_FILE` or the generated-process inputs below:

```sh
APP_ID=operix-booking-web
APP_KIND=pm2
PUBLIC_HEALTH_URL=https://staging.example.invalid/api/health
PM2_PROCESS=operix-booking-web
PM2_RELEASE_ROOT=/srv/operix/pm2/operix-booking-web
PM2_WORKSPACE=operix-booking-web
PM2_START_ARGS="-p 3015 -H 127.0.0.1"
PM2_ENV_FILE=/etc/operix/deploy/env/operix-booking-web.env
RELOAD_NGINX=0
```

The incoming archive is extracted after tar path validation. PM2 policies are
root-owned; the optional environment file is sourced only on the server and is
never included in the archive. Only the named process is reloaded.

## Safety contract

- Only `deploy APP ENV IMAGE@sha256:DIGEST FULL_COMMIT_SHA` and
  `rollback APP ENV TARGET` are accepted.
- Docker uses an exact GHCR digest and a generated Compose override for one
  service. It never uses `latest`, `docker system prune`, or a global restart.
- PM2 uses a retained release directory and `startOrReload --only`; it never
  runs `pm2 restart all`.
- Nginx is validated with `nginx -t` before a reload.
- A per-environment, per-app `flock` prevents concurrent deployments and
  rollbacks; staging and production state are kept separately.
- The current release is recorded before switching. A failed health check tries
  the previous known-good artifact and reports either
  `DEPLOYMENT_FAILED_ROLLED_BACK` or `DEPLOYMENT_FAILED_ROLLBACK_FAILED`.
- Health checks are external HTTPS checks and must not create production data.

The current VPS audit found no OperiX policy files, no OperiX staging target,
and no verified GHCR pull credential. Therefore the GitHub workflows fail closed
until this server-side contract is installed and validated.
