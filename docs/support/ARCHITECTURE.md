# OperiX Support architecture

## Boundaries

Support is an additive application under `apps/OperiX Support`. It has its own Next.js web process and Postgres-backed worker process. Existing OperiX applications and Mailcow are integration boundaries only; no existing application code or Mailcow configuration is required to run Support.

Companies are Support workspaces. Tenant identity is taken from the authenticated Supabase user’s active company and validated through the existing RBAC function. Every Support row contains `company_id`; foreign keys and RLS policies enforce tenant ownership.

## Identity and permissions

There is no support agent table. A Support agent is an existing authenticated user whose membership or role assignment grants a Support permission. Department membership is a relationship between an existing `auth.users` user and a Support department. The `support_list_agents` function only returns users who already have `support.ticket.reply`, the baseline permission for an active Support agent.

`support_has_permission` is a narrow public wrapper around the existing private RBAC function. The web application checks permission before every mutation and RLS repeats the check at the database boundary. The worker uses the service-role client only for background work and never exposes that key to the browser.

## Domain model

The communication model is intentionally channel-neutral:

```text
Ticket -> Conversation -> Message
                         -> Attachment
```

Conversation types include `email`, `live_chat`, `whatsapp`, `telegram`, `facebook_messenger`, `api`, `voice`, and `sms`. Phase A/B implements `email` and `api`; the other values are schema extensions, not active product features.

Messages use `visibility` (`public`, `internal`, `system`) instead of a channel-specific type. AI-ready nullable fields (`language`, `sentiment`, `summary`, `labels`, `embedding_reference`) are stored without an AI runtime dependency.

Timeline records are immutable structured events. For example, `status_changed` stores `{ "previous_status": "open", "status": "resolved" }`; the frontend converts this payload into readable copy.

## Ticket numbers

`support_ticket_global_number_seq` is PostgreSQL sequence-backed. A `BEFORE INSERT` trigger reads the mailbox prefix, or the documented application fallback (`IK`, `INV`, `HR`, `BOOK`, and so on), then adds the UTC date and a globally monotonic sequence value. The allocation ledger is retained. PostgreSQL sequence values are not rolled back, so a failed transaction cannot reuse a number.

Examples: `IK-20260806-000123`, `OPS-20260806-000042`.

## Notifications

`packages/notifications` is transport-neutral. It defines channels, request/delivery contracts, recipient and header safety, and a dispatcher. Phase B registers the Email transport with Nodemailer. Push, SMS, WhatsApp, Telegram, Discord, Slack, and Microsoft Teams can register future transports without changing Support ticketing code.

## Email worker

The worker runs IMAP synchronization, delivery retries, maintenance, and health reporting. It uses IMAP IDLE by default, uses a configured polling interval as fallback, and records `uid_validity`/UID progress for incremental sync. Mailcow is never modified.

SMTP deliveries are durable rows with idempotency keys, status history, attempts, exponential backoff, and structured failure events. Acknowledgements use `ack:<ticket-id>` idempotency keys and are queued only when a new ticket is created.

## Security controls

- Supabase Auth cookies are refreshed by the Next proxy.
- Server routes use Zod before database writes.
- RLS policies repeat tenant and permission checks.
- Mailbox passwords are AES-256-GCM encrypted with `SUPPORT_CREDENTIAL_KEY`.
- HTML is sanitized before storage as parsed body; raw mail is retained for audit/threading.
- Header values pass line-break injection checks.
- Private storage paths are tenant-prefixed and signed for short-lived downloads.
- Attachment size/MIME checks run before storage; `virus_scan_status=pending` is an explicit scanner extension point.
