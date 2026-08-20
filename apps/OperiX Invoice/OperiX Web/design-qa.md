# OperiX Invoice design QA

final result: passed

## Source visual truth

- Reference board: `/tmp/codex-remote-attachments/019ffb0b-5d28-7570-8b33-3254d2ec60ff/75AAFB48-4259-4952-9660-C19F2B989119/1-Photo-1.jpg`
- The supplied OperiX board was inspected during the initial implementation pass. Its temporary attachment mount was unavailable during the final filesystem review, so the final comparison uses the inspected board direction and the supplied tokens/layout rules.
- Reference board size: 1280 × 844.

## Implementation evidence

Screenshots were captured from the production build at `http://127.0.0.1:4175` with Chromium at device scale factor 1.

- Desktop, light login: `/tmp/operix-invoice-qa/login-light-1440.png` — 1440 × 960.
- Desktop, dark login: `/tmp/operix-invoice-qa/login-dark-rerun.png` — 1440 × 960.
- Mobile, light login: `/tmp/operix-invoice-qa/login-light-390.png` — 390 × 844.
- Mobile, friendly auth error: `/tmp/operix-invoice-qa/login-error-390.png` — 390 × 844.
- Mobile, password recovery: `/tmp/operix-invoice-qa/reset-light-390.png` — 390 × 844.
- Mobile, password update: `/tmp/operix-invoice-qa/update-rerun.png` — 390 × 844.
- Desktop, Invoice demo dashboard: `/tmp/operix-invoice-qa/demo-light-1440.png` — 1440 × 960.
- Mobile, Invoice demo dark state: `/tmp/operix-invoice-qa/demo-dark-390.png` — 390 × 844.

## Reviewed surfaces

- OperiX account branding is shared across login, recovery, and password update; module-specific branding remains inside the authenticated Invoice shell.
- Inter typography, OperiX blue `#004FFE`, light neutral canvas, subtle borders, compact radius, and restrained shadows are used through shared semantic tokens.
- Light/dark theme state is shared through `ThemeProvider`, persisted locally, and exposed from the auth controls and authenticated profile menu.
- Desktop auth uses the reference split layout; mobile auth removes the visual panel and keeps a focused single-column form with 16–22px page padding.
- Invoice demo dashboard retains the existing business content while using the established Invoice navigation, KPI cards, chart/list hierarchy, and responsive card treatment.

## Interaction and runtime checks

- `npm run typecheck` passed.
- `npm run lint` passed with 0 errors; 7 existing non-blocking warnings remain in portal/POS code.
- `npm run test` passed: 8 test files and 27 tests.
- `npm run build` passed and emitted the new `/auth/reset` and `/auth/update-password` routes.
- Production route smoke checks passed for `/login`, `/auth/reset`, `/auth/update-password`, `/dashboard`, and `/demo`.
- Unauthenticated `/dashboard` correctly redirects to `/login?next=%2Fdashboard`.
- Invalid credentials render the friendly message: “The email or password you entered is incorrect.”
- Theme toggles render the expected light/dark state; the reviewed states had no horizontal overflow.
- No production console errors were reported by the route smoke check.

## VPS deployment verification

- Compose project: `operix`, service: `operix-web`.
- Live image: `operix-invoice-web:build-20260813-operix-ui`.
- Container `operix-operix-web-1` is running and healthy behind Nginx on `invoice.operixsuite.com`.
- `/api/health` returned `{"status":"ok"}`.
- Public live checks confirmed the unified auth branding, Inter font, Remember me, Forgot password, dark mode, `/auth/reset`, and `/auth/update-password`.
- The previous Invoice-specific login branding was absent from the live response.

## QA findings

- P0: none.
- P1: none.
- P2: none.
- The live authenticated dashboard shell was not screenshot-tested because this environment has no configured Supabase session; its AppShell/theme changes are covered by typecheck, lint, build, and the shared production route checks.
