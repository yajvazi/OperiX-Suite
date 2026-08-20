---
title: Localization
description: Maintain English and Albanian localization in the mobile app and documentation.
category: developer
language: en
keywords:
  - i18n
  - Albanian
  - English
  - translations
  - locale
---

# Localization

## Implementation

`packages/i18n/src/index.ts` contains the `en` and `sq` translation objects, `TranslationKey` typing, currency/date formatters, locale normalization, and `t()` lookup. `packages/hooks`/theme context persist the language with AsyncStorage and call `setAppLocale`.

`sq`, `sq-*`, and `sq-XK` normalize to `sq`; the Intl locale is `sq-XK`. English uses `en-US`.

## Adding a translation

1. Add the key to the translation type/object for both `en` and `sq`.
2. Use `t('key', language)` in the screen rather than a new hard-coded user-facing label.
3. Run the mobile localization check and typecheck.
4. Check long Albanian labels in narrow cards/buttons.
5. Update the user documentation page if the visible workflow changed.

## Current findings

The current localization check reports 1,361 English keys and 1,361 Albanian keys, with no missing or extra keys and no missing keys used by mobile source. It flags eight same-value pairs for review. Some report preview labels/errors are literal English. These are documented in [Known limitations](../../KNOWN-LIMITATIONS.md); do not mark runtime translation complete merely because the catalog check passes.

## Documentation parity

Every user-facing English page has a same-path Albanian page under `docs/mobile/sq`. Use [Translation status](../../TRANSLATION-STATUS.md) and run the parity script/check described in [Testing](../testing/README.md).
