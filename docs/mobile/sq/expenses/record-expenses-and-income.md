---
title: Regjistrimi i shpenzimeve dhe të hyrave
description: Krijoni shpenzim ose të hyrë, caktoni kategori dhe bashkëngjitni dëshmi.
category: expenses
language: sq
keywords:
  - shpenzim
  - të hyra
  - dëshmi
  - kategori shpenzimi
---

Gjuha: [English](../../en/expenses/record-expenses-and-income.md) | **Shqip**

# Regjistrimi i shpenzimeve dhe të hyrave

## Krijoni shpenzim

1. Hapni **Business > Expenses** ose **More > Expenses**.
2. Shtypni **Add expense**.
3. Zgjidhni **Expense**.
4. Vendosni datën, përshkrimin, shumën dhe kategorinë.
5. Shtoni foto të faturës dhe shënime nëse duhet.
6. Ruajeni.

Shuma duhet të jetë pozitive. Rrjedha e re e shpenzimit përdor RPC-në e postimit me idempotency key kur backend-i e lejon.

## Krijoni të hyrë

Në të njëjtin formular zgjidhni **Income**, plotësoni datën, përshkrimin, shumën dhe kategorinë dhe ruajeni. Burimi aktual e ruan ndryshe nga shpenzimi i postuar; nuk dokumentohet si rrjedhë e plotë e veçantë kontabël.

## Fushat dhe kategoritë

Fushat janë data, lloji, përshkrimi, shuma, kategoria, dëshmia/fotoja dhe shënimet. Kategoritë e shpenzimeve përfshijnë Travel, Supplies, Marketing, Software, Rent, Utilities dhe Other. Të hyrat përfshijnë Sales, Refund, Grant, Investment dhe Other, si dhe kategori të ngarkuara.

Lista filtron sipas llojit, kategorisë dhe kërkimit. Paneli tregon shpenzime, të hyra dhe bilancin. Ekziston fshirja; kontrolloni politikën para heqjes së të dhënës.

Të lidhura: [Raportet](../reports/financial-reports.md), [Faturat e furnitorëve](../company/suppliers-and-bills.md).
