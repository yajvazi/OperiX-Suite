# Stripe store sync setup

The Invoice mobile app uses Stripe Connect OAuth. Stripe secret keys and
connected-account tokens are read only by Edge Functions; never enter an
`sk_...` key in the mobile app.

Set the server secrets before deploying:

```sh
supabase secrets set \
  STRIPE_CLIENT_ID=ca_... \
  STRIPE_SECRET_KEY=sk_... \
  STRIPE_WEBHOOK_SECRET=whsec_...
```

Deploy these functions:

```sh
supabase functions deploy stripe-start
supabase functions deploy stripe-connect
supabase functions deploy stripe-sync
supabase functions deploy stripe-disconnect
supabase functions deploy stripe-settings
supabase functions deploy stripe-webhook
```

In Stripe, configure the Connect OAuth redirect URI as:

```text
https://<supabase-project-domain>/functions/v1/stripe-connect
```

Configure a Connect webhook endpoint at:

```text
https://<supabase-project-domain>/functions/v1/stripe-webhook
```

Subscribe at least to `charge.succeeded`, `charge.refunded`, `payout.paid`,
`payout.failed`, `balance.available`, and `invoice.paid`. The webhook handler
verifies the raw Stripe signature and uses the same idempotent sync path as the
manual Sync button.

