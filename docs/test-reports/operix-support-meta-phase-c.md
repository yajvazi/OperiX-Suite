# OperiX Support Phase C Test Report

Date: 2026-08-07

## Automated checks run

From the repository root:

```text
npm test --workspace operix-support       PASS — 8 files, 15 tests
npm run typecheck --workspace operix-support PASS
npm run lint --workspace operix-support    PASS
npm run build --workspace operix-support   PASS — Next production build
E2E_PORT=3310 npm run test:e2e --workspace operix-support
                                           PASS — 4 Playwright smoke tests
```

Focused unit coverage includes:

- HMAC webhook signature creation/validation and malformed signature rejection.
- Messenger/Instagram provider mapping, echo filtering, delivery/read events, and attachment kind parsing.
- Provider-specific send routing and Instagram read-watermark handling.
- OAuth state signing, tenant/user binding, expiry/tamper rejection, permission union, and token-expiry metadata.
- Existing Support parser, secrets, worker, email, and domain tests.

## Database verification

The Phase C migration was applied successfully to the running local Supabase Postgres 17 instance. Verified:

- all `support_channel_*` and `support_notifications` tables have RLS enabled;
- `authenticated` can read safe account display fields;
- `authenticated` cannot select `access_token_encrypted`;
- `service_role` can access channel persistence;
- the inbound RPC is service-role-only and the agent-reply RPC is unavailable to `anon`.

## Not executable without external Meta credentials

The following require a configured Meta App, App Review/Advanced Access, real Page/Instagram assets, and a publicly reachable HTTPS callback:

- live OAuth authorization and asset selector;
- real Messenger and Instagram webhook delivery;
- Graph API send/delivery/read callbacks;
- real Meta attachment download/send;
- reconnect behavior against an expired/removed permission.

Those checks are documented in the production smoke checklist and should be run in staging before Live mode.
