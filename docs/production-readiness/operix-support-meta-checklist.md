# Phase C Production Readiness Checklist

## Code and data

- [x] Additive migration only; existing Support ticket graph reused.
- [x] Facebook and Instagram provider fields are tenant-scoped.
- [x] RLS enabled on all channel and notification tables.
- [x] Explicit Data API grants; no anonymous access.
- [x] Authenticated role cannot select encrypted token columns.
- [x] Service-role-only inbound ingestion function.
- [x] HMAC-signed OAuth state and HttpOnly state cookie.
- [x] Webhook raw-body signature verification with constant-time comparison.
- [x] Idempotent event/message keys and duplicate suppression.
- [x] Retry state for rate limits, network errors, and failed webhook events.
- [x] No WhatsApp permissions, tables, routes, or provider behavior.

## Operations

- [ ] Production Meta App Review/Advanced Access approved.
- [ ] `META_APP_SECRET`, `SUPPORT_CREDENTIAL_KEY`, and `META_OAUTH_STATE_SECRET` stored in the production secret manager.
- [ ] OAuth and webhook URLs use the production HTTPS hostname.
- [ ] Web and worker run the same migration/configuration and are monitored.
- [ ] Worker health and failed event metrics are alerting.
- [ ] Attachment storage/quarantine scanning is configured for the production policy.
- [ ] Token/secret redaction verified in logs and traces.
- [ ] Incident runbook tested by an on-call engineer.
- [ ] Backup/restore test includes channel ledgers and ticket links.

## Acceptance smoke test

- [ ] Connect a Meta Business account.
- [ ] Select one Facebook Page and one linked Instagram Business account.
- [ ] Verify connection status, permissions, and webhook health in Settings.
- [ ] Send a Messenger DM and confirm one contact, ticket, conversation, and message.
- [ ] Send an Instagram DM and confirm the same graph with an Instagram badge.
- [ ] Replay the webhook and confirm no duplicate ticket message.
- [ ] Reply from OperiX and confirm provider delivery.
- [ ] Send an image and confirm metadata plus private attachment preview/download where Meta permits.
- [ ] Assign, reassign, bulk assign, and unassign without provider-specific UI logic.
- [ ] Confirm assigned-agent in-app notification.
- [ ] Disconnect and confirm old tickets remain readable while future events stop routing.
- [ ] Remove a permission/expire a token and confirm `needs_reauthorization` plus a safe UI error.
