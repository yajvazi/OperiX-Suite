# OperiX CRM troubleshooting

## CRM unavailable

Run `infrastructure/operix-crm/scripts/healthcheck.sh`, inspect only the CRM
Compose project, and confirm the proxy forwards to localhost port 3020. Do not
restart unrelated OperiX services.

## Webhooks failing

Check the configured webhook URL, HMAC secret, timestamp clock skew, and the
`OPERIX_CRM_WEBHOOKS_ENABLED` flag. A duplicate event is a successful no-op.
Events without a valid organization are rejected and must be corrected in the
Twenty custom organization field before replay.

## Customer not linked

Inspect the event and entity-link status through the existing admin access
path. Confirm the organization UUID, membership owner/admin, feature flag,
Invoice customer ID (if supplied), and Twenty API key role. A failed mapping is
safe to retry after the cause is fixed; do not create a second customer by name.

## Emergency rollback

Set all CRM flags false, pause the webhook route, stop only the CRM Compose
project if required, preserve event rows, and follow the backup/restore or
upgrade rollback procedure. Financial record creation is disabled by default.
