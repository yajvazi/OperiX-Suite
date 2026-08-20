# Meta Channels Deployment Guide

## Required server configuration

Set these only on the Support web and worker processes. Do not put them in `NEXT_PUBLIC_*` variables:

```dotenv
META_APP_ID=...
META_APP_SECRET=...
META_GRAPH_API_VERSION=v25.0
META_OAUTH_CONFIG_ID=...
META_OAUTH_STATE_SECRET=<independent-random-secret>
META_REDIRECT_URI=https://helpdesk.operixsuite.com/api/meta/oauth/callback
SUPPORT_PUBLIC_URL=https://helpdesk.operixsuite.com
META_WEBHOOK_URL=https://helpdesk.operixsuite.com/api/webhooks/meta
META_WEBHOOK_VERIFY_TOKEN=<random-webhook-token>
SUPPORT_CREDENTIAL_KEY=<long-random-secret>
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPPORT_CREDENTIAL_KEY` encrypts mailbox and Meta credentials. Rotate it only with a planned credential re-encryption migration; changing it without re-encrypting makes existing credentials unreadable.

## Database

Apply `supabase/migrations/20260807120000_phase_c_meta_channels.sql` after the Support foundation migration. Verify:

```sql
select relname, relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and relname like 'support_channel_%';

select has_column_privilege(
  'authenticated', 'public.support_channel_accounts',
  'access_token_encrypted', 'SELECT'
);
-- expected: false
```

The project uses explicit Data API grants because new Supabase public tables are not automatically exposed in current projects. Never grant `anon` access to channel tables.

## Containers/processes

Deploy both:

- `operix-support-web` for OAuth, settings, inbox, replies, and webhooks.
- `operix-support-worker` for outbound retries and failed webhook event retries.

The worker must use the same Supabase URL, service-role key, credential key, Meta App Secret, and graph version as the web process.

## Rollout order

1. Register the production callback URL and webhook URL in Meta.
2. Apply the migration and verify RLS/grants.
3. Deploy web and worker with server-only environment variables.
4. Run health and browser smoke tests.
5. Connect an internal test Page/Instagram account.
6. Send an inbound test DM, reply from Support, and confirm delivery/read events.
7. Enable Meta App Live mode/Advanced Access only after the test is successful.

## Secret handling

Redact `META_APP_SECRET`, OAuth codes, access tokens, signed state values, and raw authorization headers from logs, traces, support tickets, and incident screenshots. Rotate the Meta App Secret and webhook verify token together with a controlled Meta dashboard change.
