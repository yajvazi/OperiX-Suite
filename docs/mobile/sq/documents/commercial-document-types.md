---
title: Llojet e dokumenteve tregtare
description: Mësoni si dallohen faturat, ofertat, pro-faturat, porositë, fletëdërgesat dhe notat korrigjuese.
category: documents
language: sq
keywords:
  - ofertë
  - pro-faturë
  - porosi
  - fletëdërgesë
  - faturë
  - notë krediti
  - notë debiti
---

Gjuha: [English](../../en/documents/commercial-document-types.md) | **Shqip**

# Llojet e dokumenteve tregtare

OperiX e ruan identitetin në fushën `commercial_document_type`. Lloji nuk merret nga titulli i PDF-së.

| Lloji | Etiketa | Çfarë ofron kodi aktual |
|---|---|---|
| `QUOTE` | Ofertë | Propozim tregtar, statuset dhe konvertimi në porosi/faturë |
| `PROFORMA` | Pro-faturë | Dokument paraprak, konvertim në faturë ose rrjedhë paradhënieje |
| `SALES_ORDER` | Porosi | Porosi e kërkuar/konfirmuar; fusha për porositur/dërguar/mbetur |
| `DELIVERY_NOTE` | Fletëdërgesë | Dokument i dorëzimit; rrjedha mobile e përmbushjes është e pjesshme |
| `INVOICE` | Faturë | Rrjedha kryesore, POS dhe postimi në backend |
| `ADVANCE_INVOICE` | Faturë Paradhënie | Lloji dhe konvertimi ekzistojnë; rakordimi i plotë është i pjesshëm |
| `FINAL_INVOICE` | Faturë Përfundimtare | Konvertim nga paradhënia; kontrolloni aplikimin e paradhënies |
| `CREDIT_NOTE` | Notë Krediti | Krijohet nga faturë origjinale për korrigjim |
| `DEBIT_NOTE` | Notë Debiti | Krijohet nga faturë origjinale për korrigjim në rritje |
| `SIMPLIFIED_INVOICE` | Faturë e Thjeshtuar | Njihet nga domeni; nuk ka kartë të veçantë krijimi |
| `FISCAL_RECEIPT` | Kupon Fiskal | Vetëm lloj i përbashkët; EFS është i çaktivizuar |
| `BAD_DEBT_INVOICE` | Faturë për borxh të keq | Fjalor i brendshëm; nuk është veprim i zakonshëm mobil |

Ofertat, pro-faturat, porositë dhe fletëdërgesat kanë efekte të dallueshme ose të varura nga politika për kontabilitet, TVSH, arkëtim, inventar dhe fiskalizim. Rezultati përfundimtar varet nga RPC-të, lejet dhe konfigurimi i kompanisë; kjo faqe nuk jep këshillë ligjore.

Statuset ndryshojnë sipas llojit. Ofertat kanë draft, dërguar, parë, pranuar, refuzuar, skaduar, konvertuar dhe anuluar. Pro-faturat kanë edhe pjesërisht paguar/paguar. Porositë, fletëdërgesat dhe faturat kanë statuset e tyre.

Përdorni veprim të dukshëm ose konvertim. Mos ndryshoni vetëm titullin e PDF-së.

Shihni [Konvertimet](./conversions-and-related-documents.md) dhe [Krijimin e faturës](../invoices/create-and-edit.md).
