# OperiX Invoice Mobile Documentation

The suite-wide interaction language is documented in [OPERIX-MOBILE-DESIGN-SYSTEM.md](./OPERIX-MOBILE-DESIGN-SYSTEM.md).

This documentation describes the current Expo/React Native application in:

`apps/OperiX Invoice/OperiX Invoice Mobile`

It is source-driven. A feature is documented as available only when it is present in the mobile source, its navigation, or the database/API contracts used by that source. Backend-only capabilities and compatibility routes are called out separately.

## User documentation

- [English](./en/README.md)
- [Shqip](./sq/README.md)

## Developer documentation

- [Architecture](./developer/architecture/README.md)
- [Navigation](./developer/navigation/README.md)
- [Authentication](./developer/authentication/README.md)
- [Database entities](./developer/database/README.md)
- [API and RPC calls](./developer/api/README.md)
- [Supabase](./developer/supabase/README.md)
- [State management](./developer/state-management/README.md)
- [Localization](./developer/localization/README.md)
- [Security and tenant isolation](./developer/security/README.md)
- [Offline and synchronization](./developer/offline-sync/README.md)
- [PDF generation](./developer/pdf/README.md)
- [Testing](./developer/testing/README.md)
- [Deployment](./developer/deployment/README.md)
- [Developer troubleshooting](./developer/troubleshooting/README.md)

## Audit and maintenance

- [Maintaining the in-app documentation](./MAINTAINING-DOCUMENTATION.md)
- [Documentation inventory](./DOCUMENTATION-INVENTORY.md)
- [Known limitations](./KNOWN-LIMITATIONS.md)
- [Screenshot plan](./SCREENSHOT-PLAN.md)
- [Translation status](./TRANSLATION-STATUS.md)
- [Documentation audit](./DOCUMENTATION-AUDIT.md)

## Documentation status

The pages were written from the current mobile screens, navigation types, shared packages, Supabase calls, migrations, and tests. They are not a promise that every backend capability is enabled for every tenant. Status labels used by developer pages are defined in [Feature status labels](./developer/architecture/README.md#feature-status-labels).

The in-app Help & Support portal is generated from these same Markdown pages. Run `npm run docs:mobile:generate` after changing user documentation; the generated Expo asset is bundled for offline reading and must not be edited manually.

## Important scope note

The mobile client uses Supabase through `@invoice-monorepo/api` and the public Expo environment variables. It does not contain a local Supabase server. The active API URL is supplied at build/runtime; do not copy credentials into documentation.
