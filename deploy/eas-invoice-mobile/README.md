# Isolated install for the Invoice Mobile EAS build

The monorepo root installs Expo SDK 54 for several apps. Invoice Mobile is on Expo
SDK 58, so building it inside that tree links mismatched native modules and the
app crashes at launch. During an EAS build, `scripts/eas-isolate-workspace.js`
(the `eas-build-pre-install` hook) copies `package.json` and `package-lock.json`
from this folder over the repo root so only Invoice Mobile and the shared
packages it imports are installed, with one copy of every Expo/React Native
package. Nothing changes for local development or the other apps.

## When to regenerate the lockfile

Whenever the dependencies of `apps/OperiX Invoice/OperiX Invoice Mobile` or of the
shared packages it uses (`packages/api`, `billing`, `commercial-documents`,
`context`, `hooks`, `i18n`, `invoice-template`, `money`, `report-templates`,
`types`, `ui`) change:

```sh
rm -rf /tmp/isolated && mkdir /tmp/isolated
git archive HEAD | tar -x -C /tmp/isolated      # or copy the working tree
cp deploy/eas-invoice-mobile/package.json /tmp/isolated/package.json
rm -f /tmp/isolated/package-lock.json
(cd /tmp/isolated && npm install --package-lock-only --legacy-peer-deps)
cp /tmp/isolated/package-lock.json deploy/eas-invoice-mobile/package-lock.json
```

Then check in `/tmp/isolated`: `npm ci --legacy-peer-deps`, and
`npx expo-doctor` from the app folder (no duplicate-dependency failure).
