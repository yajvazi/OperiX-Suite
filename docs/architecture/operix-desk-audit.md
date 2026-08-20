# OperiX Desk audit and modernization map

Audit date: 2026-08-13

The Desk copy lives at `apps/OperiX Desk`. It is an existing React/Vite web client backed by FastAPI and SQLAlchemy. The compose and deployment configuration use the local Supabase Postgres service; the legacy SQLite snapshot was removed from the app directory after a read-only copy was preserved in `/root/OperiX-backups/operix-desk-audit-20260813/`.

## Existing feature inventory

| Existing feature | Current route | Frontend implementation | Backend endpoint(s) | Database dependency | Current permission | Mobile equivalent | Modernization status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard and occupancy summary | `/` | `frontend/src/pages/Dashboard.jsx` | `GET /analytics/employee-summary`, `GET /reservations/me` | resources, reservations | signed-in user | Home | Preserve; OperiX dashboard shell |
| Desk/room reservation and floor plan | `/floor-plan` | `FloorPlan.jsx`, `DeskDetailPanel.jsx`, `ResourceDetailsModal.jsx` | resources, floors/zones, reservations, favorites, team recommendations | resources, floor_plans, reservations, favorites | signed-in user; server booking rules | Reserve + touch floor plan | Preserve; shared typed API and realtime refresh |
| My reservations | `/reservations` | `Reservations.jsx`, `MiniCalendar.jsx` | `GET /reservations/me`, `DELETE /reservations/{id}`, `GET /reservations/limits` | reservations/resources | owner can cancel; admin can cancel | My Bookings | Preserve; card/history redesign |
| Team Builder | `/team-builder` | `TeamBuilder.jsx` | `POST /ai/team-builder` | users, reservations | manager/admin | manager-only staffing surface | Preserve; scoped to organization |
| Emergency Staffing | `/emergency-staffing` | `EmergencyStaffing.jsx` | `POST /ai/emergency-staffing` | users, reservations | manager/admin | manager action in More | Preserve; scoped to organization |
| AI Assistant | `/assistant` | `AiAssistant.jsx`, local conversation storage | `POST /ai/chat` | resources, reservations, users | signed-in user | Assistant entry in More | Preserve real AI/data path; rebrand prompts |
| Profile and password settings | `/profile` | `Profile.jsx` | `GET/PUT /auth/me` | users, uploads | signed-in user | Profile | Migrate login/password ownership to Supabase Auth; keep Desk preferences |
| Team settings | `/team` | `TeamSettings.jsx` | team-member and team assignment endpoints | users | team leader/admin | Team | Preserve; map to shared employee identity |
| Admin dashboard | `/admin` | `admin/AdminDashboard.jsx` | `GET /analytics/dashboard` | all Desk tables | admin | manager occupancy summary | Preserve; permission-gated |
| Admin reservations | `/admin/reservations` | `admin/Reservations.jsx` | `GET/PUT/DELETE /reservations` | reservations/resources/users | admin | manager reservation view | Preserve; tenant-scoped |
| Resource management | `/admin/resources` | `admin/Resources.jsx` | `GET/POST/PUT/DELETE /resources` | resources/floor_plans | admin | web-first | Preserve; shared workspace permission |
| Floor Builder | `/admin/builder` | `admin/FloorBuilder.jsx` | floor-plan upload/update/delete, resource position update | floor_plans/resources/uploads | admin | web-first | Preserve drag/drop; tenant-scoped |
| Analytics and CSV export | `/admin/analytics` | `admin/Analytics.jsx` | `GET /analytics/dashboard`, `GET /analytics/export` | reservations/resources | manager/admin | manager summary | Preserve; no invented metrics |
| User management and CSV export | `/admin/users` | `admin/Users.jsx` | users/team endpoints | users | admin | web-first | Map to HR/memberships where available |
| Audit log | `/admin/audit` | `admin/AuditLog.jsx` | `GET /audit-logs` | audit_logs/users | admin | web-first | Preserve; organization protected |
| Authentication and recovery | `/login`, `/forgot-password`, `/reset-password` | `Login.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `AuthContext.jsx` | legacy `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` | local users/password hashes | legacy Desk account | Supabase Auth | Shared Supabase Auth is now the primary path; legacy endpoints remain only for migration compatibility |

## Existing backend map

- `backend/app/main.py` registers FastAPI routers, creates/patches the SQLAlchemy schema at startup, and identifies itself as the OperiX Desk API. User and floor-plan images are served through authenticated API routes rather than a public static mount.
- `backend/app/auth.py` keeps the legacy HS256 implementation disabled by default and resolves shared Supabase Auth users, active organizations, memberships, roles, and permissions.
- `backend/app/models/` contains integer-keyed `users`, `resources`, `reservations`, `floor_plans`, `favorites`, and `audit_logs` tables.
- `backend/app/services/booking.py` centralizes most reservation rules, but the legacy migration removes the old resource/date uniqueness constraint and the create path can therefore race. The modernization adds a database guard and row locking.
- `backend/app/services/ai_*` implements real intent parsing, reservations, colleague lookup, team builder, and emergency staffing. It must remain connected to organization-scoped data.
- `backend/app/routers/floor_plans.py` stores files locally or in Vercel Blob. Service credentials remain server-only.
- `backend/app/services/notifications.py` sends email and `backend/app/services/push.py` sends best-effort Expo push notifications to tenant-bound mobile device tokens.

## Shared OperiX architecture used as the target

- Web apps use Supabase Auth sessions through `@supabase/ssr`; the invoice shell resolves the active company from `profiles`, `companies`, and `memberships`.
- Mobile apps use Expo/React Native, React Navigation, `@invoice-monorepo/api` Supabase client, `@invoice-monorepo/context` Auth/Theme providers, `@invoice-monorepo/hooks`, Lucide React Native icons, and `@invoice-monorepo/i18n`.
- The common company model is `profiles.active_company_id` / `profiles.company_id` plus active `memberships`. The latest company hierarchy helpers and `private.has_company_permission` are the database authority.
- The shared design direction is OperiX blue `#004FFE`, hover `#0044D9`, white surfaces, spacious cards, Lucide icons, and responsive/mobile bottom navigation.

## Integration decisions

1. Keep FastAPI as the Desk domain boundary because it already owns reservation validation, AI actions, exports, uploads, and the floor-plan workflow.
2. Accept Supabase Auth access tokens in FastAPI and map `auth.users.id` to the existing Desk `users.id` record by stable Supabase ID first, then normalized email. This preserves reservation ownership without copying passwords into a second account system.
3. Add an organization/company scope to Desk rows and resolve it from the shared `profiles`/`memberships` tables. Backend filters remain mandatory because the FastAPI connection is not the browser's RLS session.
4. Add Supabase RLS policies and indexes for direct authenticated access as defense in depth. RLS is not treated as a replacement for FastAPI authorization.
5. Add `packages/desk-types` and `packages/desk-api` for web/mobile contracts and the one API surface. Business rules remain in FastAPI/database, not duplicated in clients.
6. Keep legacy password endpoints only as a controlled migration bridge. New web/mobile UI uses Supabase Auth, and no service-role key is shipped to either client.
7. Use the existing Expo/React Navigation mobile architecture for `apps/OperiX Desk/OperiX Desk Mobile`; Home, Reserve, Floor, Bookings, More, authenticated floor images, realtime refresh, push registration, and deep-link routing all use the typed Desk API.

## Known legacy behavior retained

- Desk reservations are all-day; meeting rooms can use time slots.
- One active desk per employee per date and a configurable maximum active-booking count are enforced.
- Team Builder and Emergency Staffing depend on real employee profile skills and availability; no fake recommendations are introduced.
- Existing route names remain valid while `/reserve` and the OperiX navigation aliases are added.
