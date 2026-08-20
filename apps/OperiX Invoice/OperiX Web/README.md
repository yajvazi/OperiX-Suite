# OperiX Invoice Web

Desktop-first, installable PWA for OperiX Invoice. The web and Expo clients share the same Supabase accounts, companies, and business records.

## Local development

1. Start the local Supabase stack and copy `.env.example` to `.env.local`.
2. Set the local publishable key from the running stack.
3. From the repository root run `npm install`.
4. Run `npm run dev --workspace web-suite` and open `http://localhost:3000`.

Without Supabase variables the interface starts in demo mode, so visual and print workflows can still be tested safely.

## Production

Use `apps/OperiX Invoice/OperiX Web/.env.production`, then run:

```bash
docker compose -f docker-compose.web.yml up -d --build
```

Terminate HTTPS at a reverse proxy such as Caddy or Nginx and forward traffic to port 3000. Add the public HTTPS callback URL (`https://your-domain/auth/callback`) to the Supabase Auth redirect allow list. HTTPS is required for desktop PWA installation.

The container includes Chromium for deterministic A4 and 50 mm PDF rendering. In a container, set the server-only `SUPABASE_INTERNAL_URL` to the local Supabase gateway reachable from that container. Supabase secret/service-role keys must never be placed in a `NEXT_PUBLIC_` variable.
