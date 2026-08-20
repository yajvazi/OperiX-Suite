# Meta App Configuration Guide

This phase uses one Meta app with Facebook Login for Business, Messenger Platform, and Instagram messaging. WhatsApp products and permissions are not part of the configuration.

## App settings

1. Create or select the production Meta app.
2. Add Facebook Login for Business and configure the Login for Business asset flow.
3. Add Messenger Platform and Instagram messaging products as required by Meta's current dashboard.
4. Add this exact OAuth redirect URI:

   `https://helpdesk.operixsuite.com/api/meta/oauth/callback`

5. Configure the callback URL:

   `https://helpdesk.operixsuite.com/api/webhooks/meta`

6. Set a strong Verify Token and copy it to `META_WEBHOOK_VERIFY_TOKEN`.
7. Keep the App Secret server-side as `META_APP_SECRET`.

## Permissions requested

Phase C requests only:

- `business_management` for the Business asset selector.
- `pages_show_list` to enumerate Pages.
- `pages_read_engagement` to read Page metadata needed for selection/profile handling.
- `pages_manage_metadata` to manage Page webhook subscriptions.
- `pages_messaging` for Facebook Messenger send/receive.
- `instagram_basic` for linked Instagram Business account metadata.
- `instagram_manage_messages` for Instagram Direct Messages.

Do not add `whatsapp_business_management`, `whatsapp_business_messaging`, publishing, ads, or unrelated content permissions.

Meta may require App Review/Advanced Access before real customers outside app roles can message the connected assets. Complete the review for the exact messaging use case and provide a screencast of the OperiX flow.

## Asset requirements

- Facebook assets must be Pages the authorizing user can manage.
- Instagram assets must be Professional/Business accounts linked to a Facebook Page supported by the selected Login for Business configuration.
- The authorizing user needs the Page tasks/permissions Meta requires for webhook subscription and messaging.
- Test first with Meta app roles, then with a customer account after Advanced Access is approved.

## Webhook fields

Messenger: `messages`, `message_deliveries`, `message_reads`, `message_edits`, `message_echoes`, `messaging_postbacks`.

Instagram: `messages`, `messaging_postbacks`, `messaging_seen`.

The adapter records the configured fields in `support_channel_webhooks` so Settings can show the subscription contract.

## Official references

- [Meta Messenger Platform API collection](https://www.postman.com/meta/messenger-platform-api/collection/iyp204x/messenger-platform-api)
- [Meta Messenger Webhooks collection](https://www.postman.com/meta/messenger-platform-api/folder/22794852-b5d97624-14d8-4e67-a2e4-529add49ca58)
- [Meta for Developers](https://developers.facebook.com/)
