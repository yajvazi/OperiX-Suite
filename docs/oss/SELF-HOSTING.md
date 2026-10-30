# Self-hosting and the mobile app

Run the web app and its Supabase backend on your own server, then use the App Store / Google Play
**OperiX Invoice** app against it.

## How the connection works

1. Your web app publishes its public backend settings at `GET /api/connect`
   (`NEXT_PUBLIC_SUPABASE_URL` and the publishable key, both already visible to every browser).
2. **Settings → Mobile app** shows a QR code containing only `operix-invoice://connect?server=<your web address>`.
3. In the mobile app: sign-in screen → **Connect to your own server** → scan the QR code (or type the address,
   or scan it with the phone camera). The app shows the server name for confirmation, switches its backend,
   and the user signs in with an account created on that server.
4. **Switch back to OperiX Cloud** on the same screen undoes it. The choice is stored on the device.

No password, token or secret is in the QR code. The app accepts `https://` addresses only, plus `http://`
for local networks (localhost, 10.x, 192.168.x, 172.16-31.x, `.local`) for testing.

## Server requirements

- Public **HTTPS** address for the web app and for Supabase (the API URL phones will call).
- Build/run the web app with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  and optionally `NEXT_PUBLIC_SERVER_NAME` (shown in the app when connecting).
- Add the public Supabase URL to the auth redirect allow-list if you use email links.

## Not covered yet

- A published, curated database schema (migrations currently mix several products): see `README.md`.
- Billing/Stripe screens are hosted-service features; on a self-hosted server they should be hidden.
- Push notifications go through the hosted service.
- Google sign-in is configured per Supabase project.
