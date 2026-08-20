---
title: Sign in, register, and join a team
description: Learn how authentication, email verification, Google sign-in, and team invitations work in OperiX Invoice Mobile.
category: getting-started
language: en
keywords:
  - sign in
  - register
  - email verification
  - Google sign in
  - join team
---

Language: **English** | [Shqip](../../sq/getting-started/sign-in-and-account.md)

# Sign in, register, and join a team

## Sign in

1. Open OperiX Invoice Mobile.
2. On **Sign In**, enter your email and password.
3. Tap **Sign In**.
4. If the account is valid, the app loads the currently selected workspace.

The screen also contains a Google sign-in action. It opens the browser authentication flow and returns to the app through its configured redirect flow.

## Register a new account

1. Tap **Sign Up** on the sign-in screen.
2. Enter first name, last name, email, password, password confirmation, and phone.
3. Optionally enter company name and registered number.
4. Submit the form.
5. Enter the email verification code when the verification step appears.

The form validates required values, matching passwords, and the password minimum implemented in the screen. Account creation is handled by Supabase Auth.

## Join an existing company

1. Choose the team-invite link from the sign-up flow.
2. Enter the invitation token.
3. Confirm the company shown by **verify invite token**.
4. Enter your name, email, and password.
5. Submit the request.

The user may see an approval-pending screen while a company administrator completes access. The **Check status** action queries the employee record; the current navigator may require a restart or a new sign-in before the approved workspace opens.

## Session and sign out

Supabase restores the current session when the app starts and listens for auth changes. To leave the workspace, open **More > Settings** or **More > Sign out**, confirm, and let the app return to the auth stack.

## Biometric lock

If enabled in [Preferences and templates](../settings/preferences-and-templates.md), the app asks the device for biometric/passcode authentication before showing the authenticated screens. This is a device gate, not a replacement for the Supabase password or account-recovery process.

## Not currently exposed

The audited mobile code has no password-reset screen. If you cannot access the account, contact the workspace administrator or support using [Help and About](../settings/help-and-about.md).
