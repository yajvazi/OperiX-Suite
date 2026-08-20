---
title: Reports, ledgers, and report export
description: Review the financial, tax, inventory, receivables, payables, and ledger reports exposed by the mobile app.
category: reports
language: en
keywords:
  - reports
  - profit and loss
  - balance sheet
  - ledger
  - aging
  - sales book
---

Language: **English** | [Shqip](../../sq/reports/financial-reports.md)

# Reports, ledgers, and report export

Open **More > Reports**. The hub reads a company-scoped summary and shows report cards. Selecting a report opens `ReportPreview`.

## Available report definitions

The current source maps these reports to database views/tables:

- Financial snapshot/daily report — `operix_report_summary`;
- Trial balance — `operix_trial_balance`;
- Profit & Loss — `operix_profit_loss`;
- Balance Sheet — `operix_balance_sheet`;
- Cash Flow and Cash & Payments — `operix_cash_flow`;
- Changes in Equity — `operix_changes_in_equity`;
- General Ledger — `operix_general_ledger`;
- Asset Register — `operix_asset_register`;
- Inventory Register — `inventory_register`;
- Receivables Aging — `operix_ar_aging`;
- Payables Aging — `operix_ap_open_items`;
- Sales Book — `kosovo_sales_book`;
- Purchase Book — `kosovo_purchase_book`;
- Withholding Tax — `withholding_transactions`;
- Declarations — `tax_declarations`;
- Archived Documents — `document_archive`;
- Tax Calendar — `kosovo_tax_calendar`.

The accounting and tax views are server-side sources. The mobile screen does not recalculate the ledger from raw invoices.

## Preview behavior

The preview loads the selected companies’ rows in pages, so larger reports are not silently truncated at 250 records. Daily reports aggregate revenue, expenses, and net profit across the selected company scope. Other reports show row count, a primary total, and source name; rows are ordered by the report’s date/account fields and up to 100 are rendered in the list.

## Export and share

- **Share** sends a short text summary through the native share dialog.
- **Export PDF** builds a landscape print table from the first eight discovered columns and the loaded report data.

This is a convenient preview/export, not a complete statutory book export. Some report labels and errors are currently hard-coded in English.

## Ledgers

Customer and vendor ledger screens are also reachable from the customer/vendor detail and legacy finance flows. Their contents depend on tenant scope and posted data. If totals look empty, check the company selection and whether records have been posted.
