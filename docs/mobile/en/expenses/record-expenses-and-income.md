---
title: Record expenses and income
description: Create expense or income records, assign categories, attach a receipt image, and review totals.
category: expenses
language: en
keywords:
  - expense
  - income
  - receipt
  - expense category
  - expense report
---

Language: **English** | [Shqip](../../sq/expenses/record-expenses-and-income.md)

# Record expenses and income

## Create an expense

1. Open **Business > Expenses** or **More > Expenses** when the route is available.
2. Tap **Add expense**.
3. Select **Expense**.
4. Enter date, description, amount, and category.
5. Optionally add a receipt image from the device library and notes.
6. Save.

Positive amounts are required. New expense records use the expense-posting RPC with an idempotency key when the backend flow is available. The record is scoped to the active company.

## Create an income record

1. Open the same form.
2. Switch the type to **Income**.
3. Enter the date, description, amount, and category.
4. Save.

The mobile form stores income differently from a posted expense; the current source does not document a complete income accounting workflow separate from invoice/payment posting.

## Fields

| Field | Meaning | Current behavior |
|---|---|---|
| Date | Date of the record | Defaults to the current date |
| Type | Expense or income | Controls category options and save path |
| Description | Human-readable detail | Optional/used in list and PDF |
| Amount | Money value | Required and greater than zero |
| Category | Classification | Built-in categories include Travel, Supplies, Marketing, Software, Rent, Utilities, Other; income has Sales, Refund, Grant, Investment, Other, plus loaded categories |
| Receipt | Image proof | Optional; the form reads an image with base64 data and stores the resulting data URL path |
| Notes | Additional detail | Optional where shown |

## Review and delete

The expenses screen filters by all, expense, income, category, and search text. Dashboard totals include total expenses, total incomes, and balance. The current UI exposes delete; confirm before removing a record that may already be used in accounting.

Related: [Reports](../reports/financial-reports.md), [Supplier bills](../company/suppliers-and-bills.md), [Troubleshooting](../troubleshooting/common-problems.md).
