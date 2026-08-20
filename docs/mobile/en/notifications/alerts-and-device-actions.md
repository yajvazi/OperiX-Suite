---
title: Notifications, alerts, and device actions
description: Understand the alerts, mail composer, share sheet, and notification capabilities currently present in mobile source.
category: notifications
language: en
keywords:
  - notifications
  - alerts
  - reminders
  - email
  - share sheet
---

Language: **English** | [Shqip](../../sq/notifications/alerts-and-device-actions.md)

# Notifications, alerts, and device actions

The mobile app uses in-app alerts for validation, confirmation, errors, sign-out, company changes, and completed actions. It also uses platform actions for:

- email composition through Expo Mail Composer;
- PDF/document sharing through Expo Sharing;
- printing through Expo Print;
- browser links for support, registry, OAuth, and website pages.

## What is not currently documented as active

The audited mobile source contains no complete push-notification registration, token lifecycle, foreground handler, or reminder scheduler. An email compose success is not a delivery receipt, and opening a help link is not a notification subscription.

If a user expects an overdue reminder or push alert, check the account/company process and the backend notification work separately. Push notification registration is not documented as an available mobile workflow.
