# Administrator guide

1. Apply the Support migration and assign one existing company user the `support_admin` or equivalent Support permissions through OperiX RBAC.
2. Open Support Settings and create each mailbox (`support@`, `sales@`, `billing@`) with a unique prefix and department mapping.
3. Enter standard IMAP and SMTP credentials. Save; passwords are encrypted and are not displayed again.
4. Create departments and a hierarchical category tree such as `InternetKudo → eSIM → Refund`.
5. Assign existing users Support roles and department memberships. There is no agent synchronization step.
6. Create saved replies for acknowledgements, troubleshooting, and closure.
7. Send a controlled test email. Confirm one ticket, one acknowledgement, preserved attachments, and a later customer reply appended to the same ticket.
8. Monitor `/api/health`, worker `/health`, delivery logs, and structured `email_send_failed` events.

If a delivery is terminally failed, use the delivery log’s resend action after correcting the mailbox configuration. Do not manually edit ticket numbers or delete inbox dedupe records.
