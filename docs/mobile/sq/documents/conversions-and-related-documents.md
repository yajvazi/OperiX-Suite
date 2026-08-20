---
title: Konvertimi dhe dokumentet e lidhura
description: Kuptoni rrugët e konvertimit, lidhjet burimore dhe sjelljen pa dublikim.
category: documents
language: sq
keywords:
  - konverto dokument
  - dokumente të lidhura
  - dokument burimor
  - notë krediti
  - faturë përfundimtare
---

Gjuha: [English](../../en/documents/conversions-and-related-documents.md) | **Shqip**

# Konvertimi dhe dokumentet e lidhura

Nga detaji i dokumentit hapni menynë dhe zgjidhni konvertimin. Plani i përbashkët kopjon të dhënat tregtare, krijon dokument të ri dhe ruan lidhjen burimore; konvertimi vetë nuk është shitje, pagesë ose lëvizje e dytë e stokut.

## Rrugët mobile

- Ofertë → Porosi
- Ofertë → Faturë
- Pro-faturë → Faturë Paradhënie
- Pro-faturë → Faturë
- Porosi → Fletëdërgesë
- Porosi → Faturë
- Fletëdërgesë → Faturë
- Faturë Paradhënie → Faturë Përfundimtare
- Faturë/faturë përfundimtare/faturë e thjeshtuar → Notë Krediti
- Faturë/faturë përfundimtare/faturë e thjeshtuar → Notë Debiti

## Çfarë kopjohet

Kopjohen klienti dhe adresat, valuta dhe kursi kur ekzistojnë, rreshtat/sasitë, çmimet, zbritjet, klasifikimet tatimore, shënimet, referencat e porosisë dhe të dhëna të tjera tregtare. Dokumenti i ri merr numrin e vet.

## Grafi i lidhjeve

Modeli mbështet një ofertë me shumë porosi, një porosi me shumë fletëdërgesa, shumë dërgesa në një faturë, një faturë me shumë nota krediti dhe shumë pagesa. Shfaqja varet nga `document_source_links` dhe fushat e lidhjes.

## Sasitë dhe korrigjimet

Rreshtat kanë sasi të porositur, të dorëzuar dhe të mbetur. Për notat, ruani faturën origjinale dhe krijoni dokument të ri me referencë. Baza e të dhënave ka kufizime për sasinë e kredituar kur jepet rreshti burimor.

Në rast gabimi pas konvertimit, kontrolloni listën dhe dokumentet e lidhura para se ta provoni përsëri.
