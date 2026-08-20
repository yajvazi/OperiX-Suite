---
title: Stripe, PayPal, and connected services
description: Understand the payment-integration screens, Stripe synchronization paths, and PayPal link behavior.
category: integrations
language: en
keywords:
  - Stripe
  - Stripe Connect
  - PayPal
  - payment integration
  - sync
---

Language: **English** | [Shqip](../../sq/integrations/stripe-and-connected-services.md)

# Stripe, PayPal, and connected services

Open **More > Integrations**.

## Stripe

The current code contains a Stripe Connect OAuth flow and a Stripe dashboard. Depending on the connection, the app can:

- start an OAuth connection in the browser;
- read connection status from the profile;
- synchronize transactions and payouts through a Supabase Edge Function;
- use a developer-mode direct API-key synchronization path;
- show transaction/payout summaries;
- open a payout flow to record income where the screen provides it;
- disconnect the account.

Synchronization can be incremental or a deeper sync. The dashboard shows last-sync information when stored.

## PayPal

The integration screen supports storing a PayPal payment link and disconnecting/clearing it. The audited mobile code does not provide a complete PayPal transaction synchronization workflow.

## Security

Never paste a secret Stripe API key into support tickets, screenshots, documentation, or chat. The direct API-key path is marked developer-mode in source and needs server/security review before being used broadly. Prefer the server-side OAuth/Edge Function path when enabled for the tenant.

## Failure handling

If sync fails, retry from the integration/dashboard screen and check the selected company, connection status, and Edge Function logs with an administrator. See [Troubleshooting](../troubleshooting/common-problems.md).
