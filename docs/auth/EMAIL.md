# Email for sign-up codes, password resets and invitations

Your auth server must send real email for the six-digit code on sign-up to arrive. Check these settings on the
auth (GoTrue) service:

| Setting | Wrong (local test inbox) | Right |
|---|---|---|
| `GOTRUE_SMTP_HOST` / `GOTRUE_SMTP_PORT` | `supabase_inbucket_...` / `1025` | your mail provider (for example `smtp.resend.com`, `smtp.postmarkapp.com`, `smtp.sendgrid.net`) / `587` |
| `GOTRUE_SMTP_USER` / `GOTRUE_SMTP_PASS` | empty | the provider's SMTP credentials |
| `GOTRUE_SMTP_ADMIN_EMAIL` | `admin@email.com` | an address on your domain, set up with SPF/DKIM at the provider |
| `GOTRUE_MAILER_AUTOCONFIRM` | `true` (no email is ever sent) | `false` |
| `API_EXTERNAL_URL` | `http://127.0.0.1:54321/auth/v1` | `https://YOUR-DOMAIN/supabase/auth/v1` |
| `GOTRUE_MAILER_URLPATHS_CONFIRMATION`, `_RECOVERY`, `_INVITE`, `_EMAIL_CHANGE` | `http://127.0.0.1:54321/auth/v1/verify` | `https://YOUR-DOMAIN/supabase/auth/v1/verify` |
| `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` | not set (a link, no code) | `file:///templates/confirmation.html` (mount `deploy/auth/templates` at `/templates`) |

`deploy/auth/templates/confirmation.html` shows the code (`{{ .Token }}`) in English and Albanian; the mobile app asks
for exactly that code. After changing these, restart the auth service. Test with a new address: the email should arrive
within a minute (check spam). With `AUTOCONFIRM=false`, web sign-ups also need the confirmation email.

On Supabase hosted projects the same settings are under Authentication → SMTP and Authentication → Email Templates.
