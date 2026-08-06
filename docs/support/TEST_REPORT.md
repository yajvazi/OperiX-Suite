# Test report

## Automated checks

The Support workspace currently passes:

```bash
npm run typecheck --workspace operix-support
npm test --workspace operix-support
npm run worker:build --workspace operix-support
npm run build --workspace operix-support
```

The browser smoke suite also passes against the production standalone server:

```bash
E2E_BASE_URL=http://127.0.0.1:<port> npm run test:e2e --workspace operix-support
```

It covers the public health endpoint and accessible login form in desktop and mobile-sized Chromium contexts. The in-session Browser plugin was not available in this workspace, so rendered checks use regular Playwright as the documented fallback.

Coverage includes notification recipient/header safety, application-aware number formatting, message-id normalization, quote/signature cleanup, HTML sanitization/thread parsing, and encrypted credential round trips.

`npx supabase db lint --local` reaches the local schema and reports pre-existing unrelated errors in payroll functions (`digest(bytea, unknown)` and an existing payroll `ON CONFLICT` issue). No Support migration error was reported. Those unrelated migrations were not changed.

## Required integration scenarios

Run against a disposable Supabase project and test Mailcow account before production:

- ticket creation returns a globally unique prefix/date/sequence number;
- assignment rejects users without Support permission;
- RLS blocks cross-company ticket/contact/message reads and writes;
- new email creates exactly one contact, ticket, conversation, message, acknowledgement delivery, and attachment set;
- duplicate IMAP UID, Message-ID, and content hash import only once;
- In-Reply-To, References, and ticket-number fallback append to the same ticket;
- SMTP failures retry with backoff and manual resend requeues a terminal delivery;
- public replies are sent; internal notes are never queued for email;
- attachment limits, MIME allowlist, signed downloads, and pending scan state work;
- dashboard counts match direct database counts;
- desktop and mobile browser flows contain no runtime errors.

The database/email scenarios below require a disposable Supabase project and Mailcow test account; they are intentionally not run against production credentials in this repository workspace.
