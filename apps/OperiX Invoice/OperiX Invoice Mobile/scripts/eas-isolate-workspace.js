// EAS build hook (package.json: eas-build-pre-install).
//
// The monorepo root hoists Expo SDK 54 tooling for the other apps. Installing the
// Invoice Mobile app (Expo SDK 58) in that tree links the wrong native modules
// into the iOS build (React Native 0.81 under SDK 58 JavaScript) and the app
// crashes on launch. On the EAS builder only, swap the root package.json and
// package-lock.json for an isolated workspace containing just this app and the
// shared packages it uses, so a single Expo SDK is installed.
//
// Regenerate deploy/eas-invoice-mobile/package-lock.json whenever this app's or a
// shared package's dependencies change (see deploy/eas-invoice-mobile/README.md).
const fs = require('fs');
const path = require('path');

if (!process.env.EAS_BUILD) {
  console.log('Not running on EAS; leaving the workspace root untouched.');
  process.exit(0);
}

const repoRoot = path.resolve(__dirname, '../../../..');
const isolated = path.join(repoRoot, 'deploy', 'eas-invoice-mobile');

for (const file of ['package.json', 'package-lock.json']) {
  const from = path.join(isolated, file);
  const to = path.join(repoRoot, file);
  if (!fs.existsSync(from)) throw new Error(`Missing ${from}`);
  fs.copyFileSync(from, to);
  console.log(`Isolated Invoice Mobile workspace: replaced ${path.relative(repoRoot, to)}`);
}
