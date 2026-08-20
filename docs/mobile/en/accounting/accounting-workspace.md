---
title: Accounting workspace
description: Understand the mobile accounting entry points and how posted records are supplied by the backend.
category: accounting
language: en
keywords:
  - accounting
  - journal
  - general ledger
  - posting
  - periods
---

Language: **English** | [Shqip](../../sq/accounting/accounting-workspace.md)

# Accounting workspace

Open **More > Accounting**. The mobile screen provides shortcuts to sales book, daily report, customer ledger, and related accounting/report tools. The More menu also opens the full [Reports](../reports/financial-reports.md) hub.

## What mobile does

The mobile client reads company-scoped accounting/report views and calls backend RPCs for operations such as invoice posting, customer payment posting, supplier payment posting, expense posting, and reversals where the originating screen supports them.

## What backend permissions control

The accounting migrations use company permissions such as journal creation/posting, accounting read, sales-invoice posting, supplier-bill posting, and expense posting. A visible card does not guarantee that the current role can post. The server must authorize the action.

## Posted versus draft data

Operational documents such as quotes, proformas, orders, and delivery notes can remain non-posting records. Invoices and payments may be posted by their specific RPC workflows. Reports generally read posted/accounting views, so a saved draft may not appear in a report.

## Safe support practice

When a total differs from a document screen, record the company, document ID, status, accounting state, and report source. Do not manually edit an issued invoice to make a report balance; use the supported correction/posting workflow and review [Invoice statuses](../invoices/invoice-detail-and-statuses.md).
