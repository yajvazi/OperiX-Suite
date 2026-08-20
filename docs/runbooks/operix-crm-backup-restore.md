# OperiX CRM backup and restore

## Backup

Run `infrastructure/operix-crm/scripts/backup.sh` on the CRM host. It creates a
timestamped directory containing a custom-format Twenty Postgres dump, a tarball
of the persistent local storage volume, and a non-secret environment reference.
Back up the OperiX Supabase database using its existing provider procedure;
that backup must include `integration_entity_links`, `integration_events`, and
`integration_audit_logs`. Never copy real secrets into the repository or runbook.

## Restore

1. Set `OPERIX_CRM_ENABLED=false` and pause webhook/sync processing.
2. Validate the backup checksum, target host, Twenty tag, and encryption key.
3. Put CRM in maintenance mode and stop only the CRM server/worker.
4. Run `scripts/restore.sh /absolute/path/to/backup-directory`; it requires an
   explicit confirmation and restores the isolated Postgres and local storage.
5. Start the project and run the health check.
6. Validate login, workspace objects, API access, and storage files.
7. Reconcile pending/failed OperiX integration events and mappings; do not
   replay blindly.
8. Re-enable flags gradually.

If restore validation fails, stop the CRM project, preserve the failed state for
diagnosis, and restore the previous matching backup. OperiX Invoice, HR,
Booking, and Desk are not stopped by this procedure.
