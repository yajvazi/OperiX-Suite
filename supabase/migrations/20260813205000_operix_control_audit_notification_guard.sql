-- Notification rows are projections of audit events, not privileged changes.
-- Auditing them would recursively create another notification for the audit row.
drop trigger if exists control_notification_events_audit on public.control_notification_events;

