---
title: Mobile build and deployment
description: Build and configure the Expo application without exposing credentials.
category: developer
language: en
keywords:
  - Expo
  - EAS
  - build
  - deployment
  - environment variables
---

# Mobile build and deployment

## App configuration

`app.json` defines Expo app name `OperiX Invoice`, slug `operix-invoice`, version `1.0.0`, portrait orientation, the icon/splash assets, iOS bundle ID `com.internetkudo.invoiceapp`, Android package, `operix-invoice` scheme, and EAS project ID. Plugins include Web Browser, Mail Composer, DateTimePicker, Location, and Font.

## Environment

The Supabase URL and anon key are supplied through `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Use environment-specific build secrets/configuration. Never add service-role credentials, Stripe secret keys, SMTP passwords, or production tokens to the mobile bundle.

## Monorepo/build

Metro is configured for the monorepo and watches workspace packages. The app has scripts for Expo start, Android, iOS, web, typecheck, tests, web export, and localization check. Run the checks from the mobile directory before an EAS build.

## Expo Go

The app is an Expo project and can be started with `npx expo start`, but device support in Expo Go depends on the SDK, native module versions, and configured development environment. Modules such as local authentication, camera, print, mail, file system, and location may require a development build or platform permission testing. Do not claim Expo Go compatibility solely from `app.json`; verify the exact build on the target device.

## Release gate

Do not release as production-ready if typecheck/build/test failures remain, company RLS is unverified, invoice numbering/posting is inconsistent, or EFS status is misrepresented. See [Known limitations](../../KNOWN-LIMITATIONS.md).
