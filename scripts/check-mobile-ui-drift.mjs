#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileApps = [
  'apps/OperiX Invoice/OperiX Invoice Mobile',
  'apps/hr-app',
  'apps/OperiX Booking/OperiX Booking Mobile',
  'apps/OperiX Desk/OperiX Desk Mobile',
  'apps/OperiX Tracker',
  'apps/OperiX Scanner',
];
const duplicateNames = new Set(['Button.tsx', 'Input.tsx', 'Card.tsx', 'Modal.tsx', 'StatusBadge.tsx', 'ScreenHeader.tsx']);
const requiredExports = [
  'OperixButton', 'OperixIconButton', 'OperixCard', 'OperixInput', 'OperixTextArea', 'OperixSelect',
  'OperixSwitch', 'OperixCheckbox', 'OperixRadio', 'OperixSearchInput', 'OperixDateInput',
  'OperixAmountInput', 'OperixBadge', 'OperixAvatar', 'OperixDivider', 'OperixAlert', 'OperixToast',
  'OperixSkeleton', 'OperixEmptyState', 'OperixErrorState', 'OperixModal', 'OperixBottomSheet',
  'OperixConfirmDialog', 'OperixListItem', 'OperixSection', 'OperixStatCard', 'OperixFloatingActionButton',
  'OperixFilterButton', 'OperixFilterSheet', 'OperixActiveFilters',
  'OperixMobileAppShell', 'OperixHeader', 'OperixBottomNavigation', 'OperixTabNavigation', 'OperixScreen',
  'OperixScrollableScreen', 'OperixFormScreen', 'OperixListScreen', 'OperixDetailScreen',
  'OperixSettingsScreen', 'OperixAccountMenu', 'OperixProductSwitcher',
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const index = fs.readFileSync(path.join(root, 'packages/ui/src/index.ts'), 'utf8');
const mobileSources = walk(path.join(root, 'packages/ui/src/mobile')).filter((file) => /\.(tsx?|jsx?)$/.test(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const publicSurface = `${index}\n${mobileSources}`;
const missingExports = requiredExports.filter((name) => !publicSurface.includes(name));
const errors = [];
if (missingExports.length) errors.push(`shared UI is missing exports: ${missingExports.join(', ')}`);

for (const app of mobileApps) {
  const appRoot = path.join(root, app);
  const componentFiles = walk(path.join(appRoot, 'src', 'components'));
  for (const file of componentFiles) {
    if (duplicateNames.has(path.basename(file))) errors.push(`${app}: duplicate common primitive ${path.relative(root, file)}`);
  }

  const brandFile = path.join(appRoot, 'src', 'theme', 'brand.ts');
  if (fs.existsSync(brandFile) && !fs.readFileSync(brandFile, 'utf8').includes('@invoice-monorepo/ui')) {
    errors.push(`${app}: theme/brand.ts must consume shared OperiX mobile tokens`);
  }

  for (const adapter of componentFiles.filter((file) => path.basename(file) === 'MobileUI.tsx')) {
    const source = fs.readFileSync(adapter, 'utf8');
    if (source.includes('StyleSheet.create') || source.includes('Modal')) {
      errors.push(`${app}: ${path.relative(root, adapter)} contains a local primitive implementation; keep it as a shared-component adapter`);
    }
  }
}

if (errors.length) {
  console.error('[mobile-ui-drift] failed');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`[mobile-ui-drift] passed: ${mobileApps.length} apps use the shared mobile token/component contract`);
}
