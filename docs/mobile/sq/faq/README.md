---
title: Pyetjet e shpeshta
description: Përgjigje për rrjedhat aktuale të OperiX Invoice Mobile.
category: faq
language: sq
keywords:
  - FAQ
  - pyetje fature
  - pyetje pagesash
  - pyetje kompanie
---

Gjuha: [English](../../en/faq/README.md) | **Shqip**

# Pyetjet e shpeshta

## Si krijoj faturë?

Hapni **Invoice**, zgjidhni klientin, shtoni të paktën një rresht, kontrolloni datën/TVSH-në/totalin dhe ruajeni. Shihni [Krijimi i faturës](../invoices/create-and-edit.md).

## A mund të krijoj ofertë ose pro-faturë?

Po. Forma dhe konvertimet i njohin të dyja. Lloji ruhet ndryshe nga `INVOICE`; titulli i PDF-së nuk mjafton.

## A mund të ndryshoj faturë të lëshuar?

Jo me editim të zakonshëm kur statusi është i pandryshueshëm. Përdorni notë krediti/debiti dhe ruani origjinalin.

## Si e shënoj faturën të paguar?

Regjistroni pagesën e klientit dhe alokojeni te fatura. Statusi ndryshon sipas rezultatit të alokimit.

## A mund të regjistroj pagesë të pjesshme?

Po. Vendosni shumën e pranuar dhe kontrolloni bilancin e mbetur.

## Si ndryshohet numërimi?

Seritë caktohen nga allocator-i transaksional i backend-it. Mos ripërdorni numër të lëshuar; kontaktoni administratorin.

## Si ndryshohet TVSH-ja?

Formulari i faturës dhe produktit ka normë/trajtim tatimor. Kontrolloni konfigurimin e kompanisë dhe rezultatin; aplikacioni nuk zëvendëson këshillën tatimore.

## Si shtoj logon dhe bankën?

Te **More > Settings** hapni seksionet e identitetit ose bankës dhe ruani logo, nënshkrim, bankë, IBAN dhe SWIFT.

## A mbështeten valuta të ndryshme?

Formatter-i njeh disa valuta, por formularët aktualë mobilë përdorin EUR si parazgjedhje dhe nuk kanë rrjedhë të plotë menaxhimi të valutës.

## A ka portal klienti në mobile?

Nuk u gjet ekran i portalit të klientit në aplikacion. Mobile mund të dërgojë email ose PDF; portali duhet verifikuar në sipërfaqe tjetër të repository-t.

## A punon aplikacioni offline?

Jo si aplikacion i plotë offline-first. Tema/gjuha ruhen lokalisht, ndërsa dokumentet zakonisht kërkojnë Supabase live dhe shporta POS është e përkohshme.

## A është aktiv fiskalizimi?

Qendra e tatimeve shfaq **EFS NOT CERTIFIED** dhe EFS i prodhimit është i çaktivizuar në konfigurimin e audituar. PDF-ja e zakonshme nuk është kupon fiskal.
