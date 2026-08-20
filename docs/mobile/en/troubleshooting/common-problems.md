---
title: Troubleshooting common problems
description: Diagnose login, saving, totals, PDF, payment, synchronization, permission, and access problems in the mobile app.
category: troubleshooting
language: en
keywords:
  - troubleshooting
  - cannot save invoice
  - PDF error
  - sync problem
  - permission denied
---

Language: **English** | [Shqip](../../sq/troubleshooting/common-problems.md)

# Troubleshooting common problems

## Cannot log in

**Symptoms:** Sign-in returns an error or the session does not open.

**Likely causes:** Wrong credentials, unverified email, network failure, expired session, or a Supabase Auth issue.

**Try:** Check the email/password, retry on a stable connection, complete the email OTP flow, and restart the app. If Google sign-in fails, retry the browser flow. There is no mobile password-reset screen in the audited source, so contact support/admin if recovery is required.

## The account is pending

**Symptoms:** The approval-pending screen remains visible.

**Try:** Ask the company administrator to approve the employee record, tap **Check status**, then restart or sign out/sign in if the navigator has not changed.

## Invoice does not save

**Likely causes:** No line, no active company, missing required customer context, invalid numeric field, missing permission, or a backend RPC error.

**Try:** Add at least one valid item, confirm the company selector, review customer and amount fields, retry once, and record the exact error/document ID. Do not repeatedly tap save if a posting flow may have succeeded; check the invoice list first.

## Customer or product does not appear

Refresh the list and confirm the selected company. The mobile queries are workspace-scoped. Check spelling/search filters and whether the record was saved under another company or as a legacy record without a company ID.

## Totals or VAT look wrong

Review quantity, unit price, discount, tax rate, and whether a product price is tax-included. The invoice form applies tax to the discounted line value. Compare the saved invoice with the backend/report source; do not edit an issued document to force a total.

## PDF does not generate or share

Confirm the document has a company, at least one line, and valid data. Retry with device storage and network access, then use the native share/print dialog. If email is the problem, check that the customer has an email address. A compose screen does not prove delivery.

## Payment status is incorrect

Open both the invoice and payment list. A customer payment is posted and then allocated in a second call. If allocation failed, the payment may exist while the invoice remains unpaid/partial. Ask an administrator to inspect the allocation record before retrying.

## Data does not synchronize / offline issue

The app uses live Supabase queries and local theme/language persistence. The POS held-order list is screen state and may be lost after reload. Reconnect, refresh, and verify the record in the current company. Do not assume an offline save occurred unless the document appears after reconnection.

## Permission denied

Ask the company owner/admin to verify membership, role, selected company, and the relevant backend permission. UI hiding is not the only authorization layer.

## EFS or fiscalization warning

The Tax Center currently shows **EFS NOT CERTIFIED** when no accepted status is available. Do not treat an ordinary PDF as a fiscal receipt. Contact the authorized fiscalization administrator.

## App crash or blank screen

Restart the app, confirm the installed build and platform, retry the last action, and record the route plus account/company context. For support, include logs only after removing tokens, passwords, and private keys.
