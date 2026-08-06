# Production readiness checklist and known limitations

## Checklist

- [x] Standalone Next.js application and separate worker.
- [x] Node 22, standalone output, Docker assets, health endpoints, and graceful shutdown.
- [x] Existing Auth/profiles/memberships/RBAC reused; no support agent/customer identity duplicates.
- [x] Tenant-keyed normalized schema, constraints, indexes, RLS, private storage, structured events.
- [x] Global non-reusable ticket number allocation and mailbox prefixes.
- [x] Zod route validation, header injection checks, HTML sanitization, attachment limits.
- [x] Email parser, threading fields, dedupe ledger, IMAP IDLE/poll fallback, SMTP retry queue, delivery logs, acknowledgement idempotency.
- [x] Phase A UI pages, loading/error/empty states, responsive OperiX design tokens, dark theme, keyboard-visible focus.
- [x] Unit/build/typecheck verification recorded.
- [ ] Apply migration to the production Supabase project and assign production Support roles.
- [ ] Configure production Mailcow mailbox credentials and perform the controlled end-to-end email test.
- [ ] Run browser/integration tests against production-like disposable services.
- [ ] Connect the virus-scanning hook and define an operational quarantine/review policy.

## Known limitations / explicit extension points

- Mailcow webhook ingestion is not implemented because Mailcow must remain untouched. IMAP IDLE is the default; polling is the fallback. A future webhook adapter can call the same inbound processor.
- The virus scanner is intentionally represented by `virus_scan_status`; files are pending until an approved scanner integration marks them clean. Outgoing SMTP only attaches clean files.
- Bounce events depend on a future provider/webhook adapter; the delivery schema already supports `bounced`.
- Customer Portal, AI assistant, Live Chat, Asset Management, Knowledge Base, and non-email channels are schema-ready but outside Phase A/B.
- SMTP’s protocol boundary cannot guarantee mathematical exactly-once delivery if a provider accepts a message and the network fails before the response. Stable idempotency keys and Message-ID values minimize duplicate risk; delivery logs make reconciliation possible.
- The current local repository has unrelated baseline Supabase lint failures in payroll functions; Support does not alter those applications or migrations.
