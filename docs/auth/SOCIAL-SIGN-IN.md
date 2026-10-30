# Google and Apple sign-in

The web app and the mobile app show **Continue with Google** and **Continue with Apple** only when the
provider is switched on in your Supabase Auth settings (they read `GET {SUPABASE_URL}/auth/v1/settings`).
Until you configure a provider its button stays hidden, so nothing is broken in the meantime.

A first-time Google or Apple account has no company yet. After signing in, the web app opens `/onboarding`
and the mobile app opens a "Set up your company" screen, where the user enters the company name. Names are
pre-filled from the Google or Apple profile.

## Addresses you will need

| Where | Value |
|---|---|
| Supabase OAuth callback (give this to Google and Apple) | `https://<your Supabase API address>/auth/v1/callback` |
| Web redirect (add to Supabase *Redirect URLs*) | `https://<your web address>/auth/callback` |
| Mobile redirect (add to Supabase *Redirect URLs*) | `operix-invoice://auth-callback` |

## Google

1. Google Cloud Console → *APIs & Services* → *OAuth consent screen*: set the app name, support email, your
   domain, and add the scopes `email`, `profile`, `openid`. Publish the app ("In production") so any user can sign in.
2. *Credentials* → *Create credentials* → *OAuth client ID* → type **Web application**.
   Add the Supabase OAuth callback above under *Authorized redirect URIs*.
3. Copy the client ID and client secret.
4. Supabase → *Authentication* → *Providers* → **Google** → enable, paste both values, save.

## Apple

You need an Apple Developer Program membership.

1. *Certificates, Identifiers & Profiles* → *Identifiers* → create an **App ID** for the iOS app with
   "Sign in with Apple" enabled.
2. Create a **Services ID** (this is the web "client ID"), enable "Sign in with Apple", click *Configure*:
   - Domains: your Supabase API host (no `https://`)
   - Return URL: the Supabase OAuth callback above
3. *Keys* → create a key with "Sign in with Apple", download the `.p8` file once, note the Key ID and your Team ID.
4. Generate the **client secret**: a JWT signed with the `.p8` key (ES256) with `iss` = Team ID, `sub` = Services ID,
   `aud` = `https://appleid.apple.com`, expiry at most 6 months. Supabase documents a generator.
5. Supabase → *Authentication* → *Providers* → **Apple** → enable, set *Client IDs* to the Services ID
   (add the app bundle ID too, comma-separated), paste the generated secret, save.

**Apple secrets expire after at most 6 months.** Put a reminder in your calendar and regenerate it; when it expires
Apple sign-in stops working until you replace it.

App Store rule: an iOS app that offers Google (or another third-party login) must also offer Sign in with Apple.
Enable both providers before you submit.

## Self-hosted Supabase

Set the same values as environment variables on the auth (GoTrue) service instead of using the dashboard:

```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...
GOTRUE_EXTERNAL_GOOGLE_SECRET=...
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://<api address>/auth/v1/callback
GOTRUE_EXTERNAL_APPLE_ENABLED=true
GOTRUE_EXTERNAL_APPLE_CLIENT_ID=<services id>[,<ios bundle id>]
GOTRUE_EXTERNAL_APPLE_SECRET=<generated jwt>
GOTRUE_EXTERNAL_APPLE_REDIRECT_URI=https://<api address>/auth/v1/callback
GOTRUE_URI_ALLOW_LIST=https://<your web address>/**,operix-invoice://**
```

Restart the auth service afterwards.

## Check it works

```sh
curl -s "$SUPABASE_URL/auth/v1/settings" -H "apikey: $PUBLISHABLE_KEY" | grep -o '"google":[a-z]*\|"apple":[a-z]*'
```

Both should say `true`. Reload the login page: the buttons appear.

## Notes

- Signing in with an email that already has a password account links to the same user when the provider
  confirms that email address.
- The mobile app opens the provider in the system browser and returns through the `operix-invoice://auth-callback`
  address. That needs a new mobile build; an older build used a different redirect.
