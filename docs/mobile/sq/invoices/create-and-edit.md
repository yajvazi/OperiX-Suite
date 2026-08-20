---
title: Krijimi dhe ndryshimi i një fature
description: Mësoni si të krijoni faturë ose dokument tjetër tregtar të mbështetur.
category: invoices
language: sq
keywords:
  - faturë
  - krijo faturë
  - ndrysho faturë
  - TVSH
  - klient
  - produkt
---

Gjuha: [English](../../en/invoices/create-and-edit.md) | **Shqip**

# Krijimi dhe ndryshimi i një fature

Aplikacioni përdor një formular të përbashkët për dokumentet tregtare. Lloji ruhet në `commercial_document_type`; titulli i PDF-së nuk e ndryshon llojin e të dhënës.

## Krijoni një faturë

1. Hapni **Invoice** ose një veprim për faturë të re.
2. Zgjidhni **Invoice** nëse shfaqet zgjedhja e llojit.
3. Zgjidhni klientin, klientin pa emër ose shtoni klient të ri.
4. Shtoni produkt ose **Custom item**.
5. Vendosni sasinë, njësinë, çmimin, zbritjen dhe normën e tatimit.
6. Vendosni datën e lëshimit dhe, nëse duhet, afatin e pagesës.
7. Kontrolloni nëntotalin, zbritjen, tatimin dhe totalin.
8. Zgjidhni bankë, para në dorë ose kartë kur shfaqet seksioni i pagesës.
9. Vendosni shumën e pranuar dhe kontrolloni kusurin kur aplikohet.
10. Shtoni shënime ose detaje të avancuara.
11. Shtypni **Save**.

Kërkohet së paku një rresht dhe kompani aktive. Kur nuk ka klient në një shitje jo-POS, përdoret rrjedha e klientit pa emër. Numri zakonisht rezervohet gjatë ruajtjes përmes `reserve_invoice_number`.

## Fushat kryesore

| Fusha | Kuptimi | Sjellja aktuale |
|---|---|---|
| Numri i dokumentit | Numri i shfaqur në dokument | Zakonisht caktohet gjatë ruajtjes; ndryshimi manual duhet të shmangë përsëritjen |
| Klienti | Klienti i dokumentit | Formulari mund të përdorë klientin pa emër |
| Data e lëshimit | Data e lëshimit | Parazgjedhje është data e sotme |
| Afati i pagesës | Data kur pritet pagesa | Opsional |
| Produkt/shërbim | Produkt ekzistues ose rresht i lirë | Për produktin kopjohen të dhënat e tij |
| Përshkrimi | Teksti i rreshtit | Opsional sipas validimit të rreshtit |
| Sasia | Numri i njësive/shërbimeve | Vendoset për çdo rresht |
| Njësia | pcs, hrs, kg, lbs, mt, ft, l, gal ose unit | Zgjidhet në formular |
| Çmimi për njësi | Çmimi para llogaritjes | Kopjohet nga produkti kur ekziston |
| Zbritja | Zbritja e rreshtit ose globale | Zbritja e klientit mund të aplikohet |
| Norma e tatimit | Përqindja e tatimit | Kopjohet nga produkti dhe llogaritet mbi shumën pas zbritjes |
| Shënimet | Tekst shtesë | Opsionale |
| Mënyra e pagesës | Bankë, para në dorë ose kartë | Përdoret edhe nga rrjedha POS |
| Shuma e pranuar | Shuma e marrë | Opsionale; ka ndihmë për shumën e saktë dhe kusurin |
| Nënshkrimi i klientit | Kërkon nënshkrim të blerësit | Shfaqet vetëm për `INVOICE` dhe kërkon Signature Pad |

Llogaritja e rreshtit është sasi × çmim, minus zbritja; tatimi aplikohet mbi shumën pas zbritjes. Kontrolloni dokumentin e ruajtur nëse një ekran i vjetër shfaq nëntotal me konventë tjetër.

## Ndryshoni një draft

Hapni dokumentin, zgjidhni **Edit** nga menyja dhe ruajeni. Dokumentet e lëshuara, të paguara, të vonuara, të kredituara, të korrigjuara ose të anuluara trajtohen si të pandryshueshme. Përdorni korrigjimin me notë krediti/debiti.

## Dokumente të tjera

I njëjti formular përdoret nga rrjedhat e ofertës, pro-faturës, porosisë, fletëdërgesës dhe konvertimit. Për dallimet shihni [Llojet e dokumenteve](../documents/commercial-document-types.md).

Të lidhura: [Klientët](../customers/manage-customers.md), [Produktet](../products/manage-products.md), [Pagesa](../payments/record-customer-payment.md), [PDF-ja](./pdf-sharing-and-printing.md).
