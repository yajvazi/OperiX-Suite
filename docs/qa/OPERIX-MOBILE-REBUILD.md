# OperiX mobile rebuild commands

All commands run from `/root/OperiX`. They use the repository lockfile and do not change production version numbers automatically.

## Dependency and web-build smoke validation

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run qa:mobile:invoice
npm run qa:mobile:all
```

The Expo web export is a smoke check for the JavaScript bundle. It is not a substitute for a native development build.

## Development build

After all critical automated checks pass and a real QA environment is configured:

```sh
node scripts/operix-mobile-qa.mjs operix-invoice --prepare-build
```

The runner validates `app.json`, dynamic Expo config, bundle identifiers, schemes, permissions, and the `development` EAS profile before invoking the repository-pinned EAS CLI. It uses the `development` profile only and never invokes `eas submit`.

For local development-client work after the build is installed:

```sh
npx expo start --dev-client
```

If native modules prevent Expo Go compatibility, record `EXPO_GO_UNSUPPORTED` in the app report and use the development client. Do not remove native functionality merely to force Expo Go support.

## Release boundary

This phase intentionally stops before TestFlight/App Store Connect. A future release workflow must require an explicit per-app manual approval and a separate release authorization.
