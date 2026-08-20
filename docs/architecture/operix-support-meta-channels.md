# OperiX Support Phase C — Meta Channels Architecture

Status: implementation design and deployment contract for `helpdesk.operixsuite.com`.

Phase C adds Facebook Messenger and Instagram Direct Messages to the existing Support graph. WhatsApp is deliberately out of scope.

## System boundaries

```text
Agent browser
    │ Supabase session + RBAC; no Meta token
    ▼
Next.js Support app ─────── Meta OAuth / Graph API
    │ server-only service role       ▲
    │                                │ encrypted page token
    ▼                                │
Supabase Postgres + private Storage  │
    ▲                                │
    └──── Support worker: retries, failed webhooks, outbound queue

Meta Webhooks ── HTTPS + X-Hub-Signature-256 ──► /api/webhooks/meta
```

The browser is authorized with the existing OperiX Supabase session and `support.channel.view` / `support.channel.manage` permissions. OAuth codes, user/page access tokens, Graph calls, webhook processing, and storage downloads are server-side operations.

## Tenant isolation

- Every channel row contains `company_id` and uses company-scoped foreign keys where a relationship crosses Support entities.
- The active Page/Instagram asset indexes are globally unique so an incoming webhook object ID cannot be ambiguously routed to two workspaces.
- Authenticated reads are protected by `private.has_company_permission`; channel writes and webhook ingestion use the service role only after the API has authenticated and authorized the initiating user.
- `access_token_encrypted` and `refresh_metadata` are excluded from authenticated column privileges. The app never selects either column with the browser client.
- Private attachments use the existing `operix-support-attachments` bucket and company/ticket paths.

## Persistence model

`support_channel_accounts` stores one selected Facebook Page or Instagram Business account. A linked Instagram row keeps its Page ID because Meta uses the Page token for the linked account subscription/send path.

`support_channel_webhooks` and `support_channel_sync_state` expose health without exposing credentials.

`support_channel_events` is the signed, deduplicated webhook ledger. `support_channel_messages` is the provider delivery ledger; it tracks direction, provider IDs, retries, and delivery/read timestamps. `support_channel_attachments` stores remote IDs/URLs and links to the existing private `support_attachments` row when the remote media is downloaded.

The existing graph remains authoritative:

```text
support_tickets
  └─ support_conversations
       provider = facebook | instagram
       channel_identifier = customer PSID / IGSID
       external_conversation_id = provider object + customer ID
       customer_id and assigned_user_id mirror the linked ticket graph
       └─ support_messages
            └─ support_attachments
```

No parallel ticket or message model is created.

## OAuth flow

1. A user with `support.channel.manage` opens `/api/meta/oauth/start`.
2. The server creates a tenant/user-bound, HMAC-signed state and stores the exact state in an HttpOnly, SameSite cookie.
3. Meta Login for Business handles Meta authentication and asset selection.
4. The callback verifies the state, current Supabase user, and company permission, exchanges the code server-side, verifies granted permissions, and fetches Pages plus linked Instagram Business accounts.
5. Candidate rows are encrypted and stored as `pending_selection`. The Settings UI lets the user choose the Pages/accounts for this workspace.
6. Activation subscribes the selected assets to the configured webhook fields. Only then are rows marked `connected`.

Reauthorization uses the same path with `auth_type=rerequest`. Disconnect removes the encrypted token, unsubscribes the Page where possible, marks the account disconnected, and keeps historical Support data.

## Inbound flow

1. Meta calls `GET /api/webhooks/meta` for verification or `POST` for an event.
2. The raw request bytes are verified using `X-Hub-Signature-256` and the Meta App Secret.
3. The event is stored with a deterministic external ID and acknowledged from the HTTP request. Duplicate webhook deliveries are acknowledged without creating a second queue row.
4. The Support worker resolves the webhook object to one tenant/account. Unknown assets are recorded as ignored and never routed to a company.
5. The worker resolves the customer profile, upserts `support_contacts`, and calls the service-role-only atomic ingestion function.
6. The function locates or creates the conversation/ticket, inserts the customer message, increments unread count, reopens resolved conversations, and emits a Support event.
7. Remote attachments are recorded immediately by the worker; downloadable media is copied to private Storage when safe and within the configured limit.

## Outbound flow

1. A public reply on a Meta conversation is written through `support_add_channel_message`.
2. `support_channel_messages` claims the reply with `outbound:<support_message_id>`.
3. The server decrypts the token, creates short-lived signed attachment URLs, and calls the appropriate Messenger/Instagram Send API path.
4. Provider IDs and status are written to the channel ledger and the Support message. Rate limits/network failures retry with exponential backoff up to eight attempts; authorization errors mark the account `needs_reauthorization`.
5. Delivery/read webhooks update the ledger. The Support worker retries queued/failed outbound messages and failed webhook events.

## Operational logging

Connection, activation, disconnect, provider failures, webhook failures, attachment failures, and assignment-notification failures are structured server logs. Connection state and administrative actions are also recorded in `support_channel_events` without secrets.

## References

- [Meta Messenger Platform Webhooks](https://www.postman.com/meta/messenger-platform-api/folder/22794852-b5d97624-14d8-4e67-a2e4-529add49ca58)
- [Supabase Data API grants and RLS](https://supabase.com/docs/guides/api/securing-your-api)
