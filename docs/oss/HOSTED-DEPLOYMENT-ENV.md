# Hosted web deployment: settings to add before the next rebuild

The public (open-source) web app no longer contains hosted-service defaults. Your
hosted deployment (`docker-compose.web.yml`, env file
`apps/OperiX Invoice/OperiX Web/.env.production`) must now set them explicitly.
`NEXT_PUBLIC_*` values are read at **build** time, so add them before `docker compose build`.

| Setting | Value for the hosted service | Without it |
|---|---|---|
| `NEXT_PUBLIC_POS_ENABLED` | `true` | POS is hidden and `/pos` returns 404 |
| `NEXT_PUBLIC_INVOICE_APP_URL` | `https://invoice.operixsuite.com` | Invoice QR codes are omitted on web-generated documents |
| `DEMO_HOSTNAME` | `demo.invoice.operixsuite.com` | The demo subdomain no longer rewrites to `/demo` |
| `OPERIX_INVOICE_IOS_TEAM_ID` | your Apple team ID | `/.well-known/apple-app-site-association` serves no app links |
| `OPERIX_INVOICE_IOS_BUNDLE_ID` | `com.lrdygroup.operixinvoice` | (same) |
| `OPERIX_INVOICE_ANDROID_PACKAGE` | `com.internetkudo.invoiceapp` | `/.well-known/assetlinks.json` serves `[]` |
| `IMAGE_REMOTE_HOSTS` | `b2b.hidroterm.net` | Product images from that host stop loading (next/image rejects the host) |
| `OPERIX_INVOICE_ANDROID_SHA256_CERT_FINGERPRINT` | (already supported) | (same) |

Optional: `NEXT_PUBLIC_POS_NOTICE` (set empty to hide the "not a fiscal receipt" notice),
`NEXT_PUBLIC_OPERIX_INVOICE_DEEP_LINK`.

The mobile app keeps its own defaults and is unaffected.
