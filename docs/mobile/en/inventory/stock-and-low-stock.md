---
title: Inventory, stock, and low-stock indicators
description: Understand the product-backed stock values and the stock behavior used by POS.
category: inventory
language: en
keywords:
  - inventory
  - stock
  - low stock
  - available quantity
  - warehouse
---

Language: **English** | [Shqip](../../sq/inventory/stock-and-low-stock.md)

# Inventory, stock, and low-stock indicators

## What the mobile app shows

Inventory in the current mobile app is product-backed. A product can have:

- stock quantity;
- a **Track stock** flag;
- a low-stock threshold;
- SKU/barcode and unit data.

The product list calculates total stock value as unit price × stock quantity and shows low-stock and out-of-stock counts. The Home dashboard counts tracked products below their threshold.

## POS stock behavior

When a tracked product is selected in POS, the cart uses available stock to limit the quantity that can be added. The final POS invoice flow calls the stock-tracked invoice RPC. A reserved quantity and physically moved quantity are different concepts in the backend domain, but the mobile product screen does not show a complete on-hand/reserved/available warehouse board.

## What is not a complete mobile workflow

The audited mobile source does not expose a complete screen for manual stock adjustments, purchase receipts, warehouse transfers, returns, stock valuation, batch/serial tracking, or warehouse selection. Backend tables/migrations may exist for some of these, but this guide does not present them as mobile features.

Related: [Products](../products/manage-products.md), [POS](../pos/point-of-sale.md), [Reports](../reports/financial-reports.md).
