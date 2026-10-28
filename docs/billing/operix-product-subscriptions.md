# OperiX product subscriptions

This is the shared billing contract for OperiX Invoice Web/Mobile, OperiX Booking Web/Mobile, and OperiX Control. The database is authoritative; client state is display-only.

## Products and prices

There is no trial: an account is free (data stays on the device) or on a paid cloud plan.


| Product | Monthly | Annual | Included |
| --- | ---: | ---: | --- |
| OperiX Invoice | €2.99 | €29.99 | 1 workspace, 1 user |
| OperiX Booking | €4.99 | €49.99 | 1 tenant, 1 active user |
| OperiX Suite | €4.99 | €49.99 | Invoice cloud + Booking cloud (Booking to follow), 1 shared workspace, 1 shared user |

Additional tenant pricing is €1.99/month or €19.99/year. Additional active user pricing is €0.99/month or €9.99/year. Suite uses one shared quantity for both products; it never charges an Invoice seat and a Booking seat for the same organization user.

Invoice and Booking can be purchased separately. The UI recommends Suite: the separate base prices are €7.98/month and €79.98/year, while Suite is €4.99/month and €49.99/year. Separate subscriptions are not silently merged.

HR and Desk are Enterprise products. They have no public Stripe price or self-service Checkout. Control creates an audited contract with negotiated price, limits, dates, billing period, trial/demo period, and product-specific limits.

## Data model

`companies` and memberships remain the workspace authority. `subscription_accounts` is the product subscription ledger, with at most one row per root company/product. `subscription_trials` stores durable one-time trial history for Invoice, Booking, and Suite. `organization_product_entitlements` is the access projection: Suite projects both `invoice` and `booking`; enterprise contracts project `hr` and/or `desk`.

`subscription_usage` is organization-wide. Only active billable tenants and active accepted customer users count. Pending invitations, disabled/deleted users, service/automation/system/internal accounts, platform identities, and Super Admin identities are excluded. Archived/deleted/suspended/internal/demo tenants are excluded while their historical data is preserved.

## Trials and restriction

The first read/onboarding path for an eligible product creates exactly one 14-day organization trial without a Stripe Customer or payment method. A Suite trial has one clock and unlocks both Invoice and Booking; if an included product trial already exists, Suite reuses that clock rather than granting another 14-day window. User, invitation, role, membership, and tenant creation/recreation events do not reset an existing product trial; account deletion preserves the company ledger and trial history.

After expiry without paid access, the product becomes restricted. Users can sign in, read historical data, view customers/products/accounting or booking records, export available data, open billing settings, and subscribe. Core paid writes are blocked centrally by database entitlement triggers and server guards. Data is not deleted.

`trialing` and `active` provide full access. `past_due` uses `STRIPE_PAST_DUE_GRACE_DAYS`; `unpaid`, `expired`, `incomplete`, and `incomplete_expired` are restricted. A canceled subscription remains entitled until its current period end. Cancellation uses `cancel_at_period_end`.

## Stripe test-mode setup

The catalog helper refuses live keys:

```sh
STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup:products
```

It creates or reuses these logical products/prices in Stripe test mode:

- OperiX Invoice: €2.99/month and €29.99/year
- OperiX Booking: €4.99/month and €49.99/year
- OperiX Suite: €4.99/month and €49.99/year
- Additional Tenant: €1.99/month and €19.99/year
- Additional Active User: €0.99/month and €9.99/year

Copy the printed IDs to server-only variables. Checkout includes the selected base price and only positive add-on quantities. Monthly plans use monthly add-ons; annual plans use annual add-ons.

Configure a test-mode Customer Portal for payment methods, billing information, invoices, and cancel-at-period-end. Tax behavior is intentionally extensible: do not enable automatic tax or claim VAT treatment until Stripe Tax registrations, price tax behavior, business address, and the commercial/legal configuration are approved.

## Environment

Required server values:

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_API_VERSION=2026-07-29.dahlia
STRIPE_INVOICE_MONTHLY_PRICE_ID=
STRIPE_INVOICE_ANNUAL_PRICE_ID=
STRIPE_BOOKING_MONTHLY_PRICE_ID=
STRIPE_BOOKING_ANNUAL_PRICE_ID=
STRIPE_SUITE_MONTHLY_PRICE_ID=
STRIPE_SUITE_ANNUAL_PRICE_ID=
STRIPE_TENANT_MONTHLY_PRICE_ID=
STRIPE_TENANT_ANNUAL_PRICE_ID=
STRIPE_USER_MONTHLY_PRICE_ID=
STRIPE_USER_ANNUAL_PRICE_ID=
STRIPE_AUTOMATIC_TAX_ENABLED=false
STRIPE_ALLOW_PROMOTION_CODES=false
STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID=
STRIPE_PAST_DUE_GRACE_DAYS=7
BILLING_APP_URL=
CRON_SECRET=
```

Never put these values in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables.

## Webhooks and synchronization

The single shared endpoint is `POST /api/webhooks/stripe` on the Invoice Web deployment. Booking does not have a competing webhook implementation. The endpoint verifies the Stripe signature, claims event IDs transactionally, reconciles Stripe to Supabase, records errors, and supports retries for:

`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`, and `payment_intent.payment_failed`.

Tenant/user changes enqueue organization billing sync. The server worker calculates usage, updates the corresponding Stripe add-on items only when quantity differs, removes zero quantities, uses `create_prorations` for increases, and uses no immediate refund for reductions. Scheduled Suite downgrades are applied at the current period boundary by the billing cron.

## Upgrade and downgrade policy

Invoice → Suite and Booking → Suite update the existing Stripe subscription, preserve the customer and organization, and reconcile entitlements. Suite → Invoice or Suite → Booking is scheduled for the paid period end; the departing product remains readable until that date and its data is preserved. Monthly/annual interval changes use the same subscription and Stripe proration behavior. Separate Invoice + Booking subscriptions require explicit consolidation rather than implicit migration.

## Security and Control

Customer billing reads and management use the existing workspace membership/RBAC path plus `billing.read`/`billing.manage`. RLS prevents cross-organization reads; Stripe IDs are only returned through platform-admin paths. Stripe secrets and payment details never reach clients. Super Admin is an internal platform role and never consumes a customer seat.

Control exposes product subscription rows, Invoice/Booking/Suite metrics, MRR/ARR, trials, conversion, past due, cancellations, and enterprise customer counts. Platform administrators can record, extend, or revoke product grants and enterprise HR/Desk contracts with actor, reason, limits, dates, notes, and audit events. Customer Admin/Manager/Employee roles cannot grant themselves access.

## Mobile distribution

Mobile reads `get_product_billing_summary` from Supabase and shows product entitlement, trial, status, usage, and exact estimated totals. It does not calculate authority locally and does not embed a native Stripe purchase button. Invoice Mobile opens `EXPO_PUBLIC_INVOICE_BILLING_URL`; Booking Mobile opens `EXPO_PUBLIC_BOOKING_BILLING_URL`. Before release, verify Apple/Google policy for each distributed market/category and, if required, add a store-compliant purchase adapter that writes the same server-side entitlement model.

## Verification

Use a local/staging Supabase project and Stripe test mode only. Verify migrations/RLS, one-time trials, Invoice/Booking/Suite Checkout, separate subscriptions, Suite shared quantities, upgrades/downgrades, cancellation, failed payment grace/recovery, quantity sync, webhook idempotency, enterprise grants, Super Admin exclusion, expired-write blocking, and cross-organization isolation. No production deployment or production billing-data mutation is part of this implementation.
