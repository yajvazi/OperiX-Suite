# OperiX CRM customer synchronization

The first release is link-first. A Twenty company event is accepted only with a
valid `organizationId` (or configured custom `operixOrganizationId`) and is
stored as a sanitized event. The gateway claims one source mapping before it
creates anything, so duplicate deliveries see the existing `processing` or
`linked` mapping rather than creating a second Invoice customer.

## Controlled flow

1. Verify the Twenty HMAC signature and timestamp.
2. Derive a stable event idempotency key from the raw signed body.
3. Reject or pause events without a valid organization or enabled flag.
4. Claim `twenty/company -> operix_invoice/client` using the unique source key.
5. If an explicit `operixInvoiceCustomerId` is present, verify it belongs to
   the organization and link it.
6. If customer creation is enabled, create one Invoice client using an owner or
   administrator membership as `user_id`, then complete the mapping.
7. Optionally write the Invoice customer UUID back to the configured Twenty
   company field using the server-side Twenty API client.
8. Record status/error metadata without logging the full payload.

No name/email matching is used as identity. No unrestricted bidirectional sync
is enabled. Automatic quote/invoice creation on opportunity won is disabled
until a separately reviewed workflow and feature flag are introduced.
