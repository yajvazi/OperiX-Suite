# Meta Webhook Runbook

Callback URL:

```text
https://helpdesk.operixsuite.com/api/webhooks/meta
```

## Verification

Configure the same random value in Meta's Verify Token field and `META_WEBHOOK_VERIFY_TOKEN`. Meta sends `hub.mode`, `hub.verify_token`, and `hub.challenge`; a valid request receives the challenge as plain text.

## Signature validation

Every POST must include `X-Hub-Signature-256`. OperiX computes HMAC-SHA256 over the exact raw request bytes with `META_APP_SECRET` and compares in constant time. Do not parse and reserialize the body before verification.

## Fields

Messenger subscriptions use `messages`, `message_deliveries`, `message_reads`, `message_edits`, `message_echoes`, and `messaging_postbacks`. Instagram uses `messages`, `messaging_postbacks`, and `messaging_seen`. Instagram outbound echoes are part of the `messages` field rather than a separate echo subscription.

## Health checks

1. In Meta App Dashboard, send a test event.
2. Confirm the request reaches the endpoint with HTTP 200 in under five seconds and that the event is queued.
3. Check Settings → Meta channels for `healthy`, last received time, and signature verification after the worker handles it.
4. Query `support_channel_events` with service access if an event is `failed`.
5. Check worker health on port 3011 and the `meta_webhook_event_failed` logs.

## Duplicate/retry behavior

Meta retries failed delivery. `support_channel_events` has a deterministic provider event key, `support_channel_messages` has provider/idempotency uniqueness, and ingestion is atomic. Replayed messages are acknowledged without a second ticket message.

If a message failed after being stored, the Support worker retries failed channel events. If the account is no longer connected, the event is retained as failed/ignored and the account is marked for reauthorization.

## Common incidents

| Symptom | Check | Action |
| --- | --- | --- |
| Verification returns 403 | Verify token, deployment URL, HTTPS | Correct Meta configuration and retry verification |
| Signature returns 403 | App Secret or proxy body mutation | Rotate/update secret; ensure raw body reaches Next.js |
| Account is `needs_reauthorization` | Permission removal or expired token | Use Reconnect in Settings and grant required permissions |
| No events for a Page | Page subscription/webhook fields | Reconnect or activate the Page again |
| Instagram sends fail | Linked Page missing or permission missing | Link the Instagram Professional account to a Page and reauthorize |
| Messages duplicate | Event ledger/index issue | Inspect `support_channel_events` and `support_channel_messages` before replaying |

Meta documents webhook delivery retries and recommends a 200 response within five seconds; keep the endpoint public, TLS-enabled, and lightweight.
