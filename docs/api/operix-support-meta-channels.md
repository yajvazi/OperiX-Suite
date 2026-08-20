# OperiX Support Meta Channels API

Base URL: `https://helpdesk.operixsuite.com`.

All authenticated routes require the existing Supabase session cookie and resolve the tenant from `x-company-id` or the active profile company. The server never returns access tokens.

## OAuth

### `GET /api/meta/oauth/start`

Requires `support.channel.manage`. Redirects to Meta Login for Business. Optional reconnect parameters:

```text
/api/meta/oauth/start?mode=reconnect&account_id=<uuid>
```

### `GET /api/meta/oauth/callback`

Called by Meta only. Verifies the signed state cookie, exchanges the code on the server, verifies permissions, persists encrypted candidate accounts, and redirects to `/settings?meta=review` or `/settings?meta=error&reason=<code>`.

## Account management

### `GET /api/meta/accounts`

Requires `support.channel.view`.

Returns safe account fields, webhook health, sync health, provider, Page/Instagram IDs, status, permission names, and timestamps. `access_token_encrypted` and `refresh_metadata` are never selected or serialized.

### `POST /api/meta/accounts`

Requires `support.channel.manage`.

Body:

```json
{ "accountIds": ["uuid", "uuid"] }
```

Subscribes selected assets to Meta webhooks and marks them connected. Unselected pending candidates have their encrypted credentials removed.

### `DELETE /api/meta/accounts/:id`

Requires `support.channel.manage`. Attempts to remove the Meta subscription, then removes the encrypted token and marks the account disconnected. Existing conversations/tickets remain.

## Webhook

### `GET /api/webhooks/meta`

Validates `hub.mode=subscribe` and `hub.verify_token=META_WEBHOOK_VERIFY_TOKEN`, then returns `hub.challenge`. Invalid verification returns `403`.

### `POST /api/webhooks/meta`

Public Meta endpoint. Requires a valid `X-Hub-Signature-256: sha256=<hex>` generated over the exact raw body using `META_APP_SECRET`. Invalid signatures return `403`; invalid JSON returns `400`; valid events are written to the durable channel-event queue and return `200` quickly. The Support worker performs Graph profile lookups, ticket/message creation, attachment handling, and retries asynchronously. Queue-write failures return `500` so Meta can retry.

## Agent replies

### `POST /api/tickets/:id/messages`

Requires `support.ticket.reply` for public replies or `support.ticket.internal_note` for internal notes. The existing body remains valid:

```json
{
  "body": "Thanks for reaching out.",
  "visibility": "public",
  "sendEmail": false,
  "attachmentIds": []
}
```

For a Facebook/Instagram conversation, the route uses the channel adapter. For an email conversation it preserves the existing email behavior. Provider failures return a typed error while the local channel ledger records retry state.

## Notifications

### `GET /api/notifications`

Requires `support.ticket.view`; returns only the current agent's Support assignment notifications.

### `PATCH /api/notifications`

Body `{ "id": "uuid" }`. Marks one current-agent notification as read.

## Error codes

Common Meta codes are `meta_not_configured`, `invalid_oauth_state`, `missing_meta_permissions`, `no_meta_pages`, `meta_reauthorization_required`, `meta_token_expired`, `instagram_page_required`, `invalid_meta_signature`, `meta_rate_limit`, and `meta_network_error`. Secrets and provider access tokens are not included in error responses or structured logs.
