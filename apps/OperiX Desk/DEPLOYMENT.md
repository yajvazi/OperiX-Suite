# Vercel Production Setup

This app deploys as one Vercel project with:

- `backend/index.py` as the Python serverless API
- `frontend/package.json` as the static frontend build

## Required environment variables

Set these in the Vercel project for production:

```env
DATABASE_URL=postgresql://postgres.gxmbwmbvdfvpdbtqybcl:YOUR_URL_ENCODED_DB_PASSWORD@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
SECRET_KEY=generate-a-long-random-secret
INITIAL_ADMIN_EMAIL=your-admin@email.com
INITIAL_ADMIN_PASSWORD=temporary-password
INITIAL_ADMIN_NAME=Your Name
BLOB_READ_WRITE_TOKEN=vercel-blob-read-write-token
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL=DeskDibs <notifications@your-verified-domain.com>
ADMIN_NOTIFICATION_EMAIL=admin@example.com
FRONTEND_BASE_URL=https://deskdibs.vercel.app
```

## Supabase

- Create or open the Supabase project.
- Go to **Project Settings -> Database -> Connection string**.
- Copy the **Transaction pooler** connection string into `DATABASE_URL`.
- Make sure `sslmode=require` is included.
- For this project, the URL should look like:

```env
DATABASE_URL=postgresql://postgres.gxmbwmbvdfvpdbtqybcl:YOUR_URL_ENCODED_DB_PASSWORD@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
```

## Vercel Blob

- Create a Blob store in the Vercel project.
- Vercel adds `BLOB_READ_WRITE_TOKEN` automatically when the store is connected.
- Floor plan uploads use Blob in production when that token is present.

## Resend email

- Create a Resend API key and set it as `RESEND_API_KEY`.
- Set `RESEND_FROM_EMAIL` to a sender from a verified Resend domain. For testing, Resend's onboarding sender may only deliver to verified recipients.
- Set `ADMIN_NOTIFICATION_EMAIL` to the admin inbox that should receive every new reservation notification. If it is omitted, the app emails all users with the `admin` role.
- Set `FRONTEND_BASE_URL` so password reset links point to production.

## Notes

- Floor plan images are stored in Blob when available.
- The initial admin account is created automatically on startup when the admin env vars are set.
- If you change the admin password env vars later, the startup bootstrap will promote that account to admin if it already exists.
