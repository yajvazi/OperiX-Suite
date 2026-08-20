---
title: Hapësira e kontabilitetit
description: Kuptoni hyrjet e kontabilitetit dhe rolin e backend-it në postim.
category: accounting
language: sq
keywords:
  - kontabilitet
  - ditar
  - ledger i përgjithshëm
  - postim
  - periudha
---

Gjuha: [English](../../en/accounting/accounting-workspace.md) | **Shqip**

# Hapësira e kontabilitetit

Hapni **More > Accounting**. Ekrani ofron lidhje për Sales Book, raportin ditor, ledger-in e klientit dhe mjete të tjera. Raportet hapen nga [Raportet](../reports/financial-reports.md).

Mobile lexon pamje kontabël të kufizuara në kompani dhe thërret RPC për postimin e faturave, pagesave të klientit, pagesave të furnitorit, shpenzimeve dhe kthimeve kur rrjedha e ekranit e mbështet.

Migrimet përdorin leje si `accounting.read`, `journal.create`, `journal.post`, `sales_invoice.post`, `supplier_bill.post` dhe `expense.post`. Karta mund të jetë e dukshme edhe kur roli nuk mund të postojë.

Ofertat, pro-faturat, porositë dhe fletëdërgesat mund të mbeten dokumente operative; faturat dhe pagesat mund të postohen. Raportet zakonisht lexojnë të dhëna të postuara. Mos ndryshoni një faturë të lëshuar për të rregulluar raportin; përdorni korrigjimin e mbështetur.
