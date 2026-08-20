# OperiX Mobile design system

This is the shared mobile interaction language for the OperiX suite. OperiX Invoice Mobile is the reference application. Product features can be specialized; common navigation, hierarchy, controls, feedback, and spacing must come from `@invoice-monorepo/ui`.

## Source-of-truth audit

The reference audit covered the Invoice Mobile app shell, five-tab navigation, authentication gates, headers, cards, dashboard/stat blocks, lists, search, forms, status badges, create actions, bottom sheets, empty/loading/error states, settings/profile routes, safe areas, touch targets, dark mode, and keyboard-safe form layouts.

The strongest existing patterns are:

- Poppins typography with a 25px page title, 19px section title, 14–17px body hierarchy, and 10–12px metadata.
- 24px screen gutters, 20px section rhythm, 16px cards, 14px controls, and 44px minimum interactive targets.
- A light `#F7F9FC` canvas, white surfaces, quiet borders, a blue `#004FFE` primary action, and restrained elevation.
- A 68px header and platform-aware bottom navigation (88px iOS / 68px Android) with the active state using the primary blue.
- Status-dot badges, inline retry/error states, centered empty states, skeleton-ready loading surfaces, and a 56px floating create action.
- Bottom-sheet actions and selection surfaces instead of product-specific modal patterns.

## Package ownership

The existing React Native package `packages/ui` is the canonical mobile UI package. Its public entry point is `@invoice-monorepo/ui`; it now exports the `Operix*` design-system surface and retains legacy names as compatibility adapters during migration.

Tokens live in `packages/ui/src/mobile/tokens.ts`. Common components live in `packages/ui/src/mobile/primitives.tsx`, and screen/application shell components live in `packages/ui/src/mobile/shell.tsx` and `navigation.tsx`.

## Shared components

Use the `Operix*` names for new code:

`OperixButton`, `OperixIconButton`, `OperixCard`, `OperixInput`, `OperixTextArea`, `OperixSelect`, `OperixSwitch`, `OperixCheckbox`, `OperixRadio`, `OperixSearchInput`, `OperixDateInput`, `OperixAmountInput`, `OperixBadge`, `OperixAvatar`, `OperixDivider`, `OperixAlert`, `OperixToast`, `OperixSkeleton`, `OperixEmptyState`, `OperixErrorState`, `OperixLoadingState`, `OperixModal`, `OperixBottomSheet`, `OperixConfirmDialog`, `OperixListItem`, `OperixSection`, `OperixStatCard`, `OperixRecordCard`, `OperixFloatingActionButton`, `OperixFilterButton`, `OperixFilterSheet`, and `OperixActiveFilters`.

Legacy `Button`, `Card`, `Input`, `StatusBadge`, `FAB`, and `ScreenHeader` exports point at the same implementations. Do not add another local copy.

## Shared shell and navigation

Use `OperixMobileAppShell` at the authenticated app root and `OperixScreen` / `OperixScrollableScreen` for screen surfaces. Use `OperixFormScreen`, `OperixListScreen`, `OperixDetailScreen`, and `OperixSettingsScreen` when the screen matches those mental models. Use `OperixHeader` for page hierarchy and `OperixBottomNavigation` plus `getOperixBottomNavigationOptions` for bottom tabs. Use `OperixProductSwitcher` with an authorization-filtered product list when an account can switch products; the shared component never invents or exposes products by itself.

```tsx
<OperixMobileAppShell product="booking">
  <NavigationContainer theme={getOperixNavigationTheme(isDark, primaryColor)}>
    <Tab.Navigator
      tabBar={OperixBottomNavigation}
      screenOptions={getOperixBottomNavigationOptions(isDark, primaryColor)}
    />
  </NavigationContainer>
</OperixMobileAppShell>
```

The tab labels and icons are product-specific. Placement, height, active treatment, hit area, and keyboard hiding are shared.

## Screen conventions

- List: `OperixHeader` → `OperixSearchInput` → filter controls/active filters → `OperixListItem` or `OperixRecordCard` → `OperixFloatingActionButton` when creation is the primary workflow.
- Detail: back header → status → information cards → quick actions → related sections/activity.
- Create/edit: back header → labeled required fields → helper/validation text → keyboard-safe content → one primary save action and consistent loading/success/error feedback.
- Settings/account: `OperixSettingsScreen` and `OperixAccountMenu`; product-specific settings are inserted as sections, not a second settings architecture.
- Empty/loading/error: use `OperixEmptyState`, `OperixLoadingState`/`OperixSkeleton`, and `OperixErrorState`. Avoid arbitrary full-screen spinners.

## Status and product exceptions

Semantic tones are `success`, `warning`, `error`, `neutral`, and `info`. Business statuses map to these tones through `statusToneFor`. Product-specific interfaces such as invoice line editing, booking calendars, desk maps, attendance, payroll, and scanner workflows may remain specialized, but their surrounding controls and surfaces must use the shared system.

Invoice Mobile's global create action remains product-specific because its action list and permission checks are invoice-domain behavior. It is built from the shared floating action button, list item, and bottom sheet.

## Accessibility and performance

Shared controls provide accessibility roles, labels, disabled/busy/checked state, 44px targets, and contrast-safe semantic colors. Keep labels meaningful and pass domain-specific accessibility text when the visible label is ambiguous. Lists should remain virtualized in product screens; shared components are intentionally lightweight and do not add a UI framework or animation runtime.

## Preventing drift

Run `npm run check:mobile-ui-drift` before review. It verifies that mobile apps consume shared token facades, that common primitive filenames are not recreated inside apps, and that compatibility UI files contain adapters rather than local primitive implementations. Run `npm run validate:mobile` for all mobile TypeScript checks.

When a product needs a new common pattern, add it to `packages/ui/src/mobile` first, document the exception here, and migrate existing apps through the shared export. Product-specific visual styling is allowed only inside a specialized feature component, not as a replacement for a shared button, field, card, sheet, navigation shell, or status treatment.
