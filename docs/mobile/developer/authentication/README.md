---
title: Authentication implementation
description: Technical reference for Supabase Auth, OAuth, OTP verification, session handling, and access gates.
category: developer
language: en
keywords:
  - Supabase Auth
  - session
  - OAuth
  - OTP
  - biometric
---

# Authentication implementation

## Provider

`packages/context/src/AuthContext.tsx` creates the auth context. On mount it calls `supabase.auth.getSession()` and registers `onAuthStateChange`. The provider exposes sign up, password sign in, Google OAuth, email OTP verification, and sign out.

## Sign-up metadata

The mobile forms send first name, last name, phone, company name, tax ID/registered number, and an invite token where applicable as Supabase Auth user metadata. Profile/company creation is handled by the existing backend triggers/RPC/migration contract, not by documentation assumptions.

## Google OAuth

The app calls `signInWithOAuth` with provider `google`, obtains an Expo redirect URI, opens `WebBrowser.openAuthSessionAsync`, parses returned hash tokens, and calls `setSession`. Redirect configuration must remain aligned with Supabase Auth and `app.json`.

## OTP

After sign-up, `SignUpScreen` presents a verification-code step. `verifyEmailOtp` calls `supabase.auth.verifyOtp` with type `signup`.

## Access gates

After a user exists, `AppNavigator` reads `profiles.biometric_enabled` and the newest `employees.status`. A pending employee sees `ApprovalPendingScreen`; biometric-enabled users see a local-authentication overlay. The approval screen’s refresh limitation is recorded in [Known limitations](../../KNOWN-LIMITATIONS.md).

## Logout and token safety

Logout calls `supabase.auth.signOut()`. The public client uses Expo public environment variables; no service-role key belongs in the app or documentation. Do not log or persist access/refresh tokens outside the Supabase client’s supported storage.

## Missing flow

No mobile password-reset method/screen was found. If added, use Supabase’s supported recovery flow and update this page, the route map, and both user guides.
