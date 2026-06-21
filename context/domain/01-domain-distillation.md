---
title: Destylacja domeny — Open Mercato (sales / customers core)
created: 2026-06-21
type: domain-distillation
---

# Destylacja domeny — Open Mercato

> Produkt tej analizy to MAPA domeny, nie kod. Prompt: `m4l5-1-domain-distillation`.
> Kroki: odkrycie → Ubiquitous Language → subdomeny → kandydaci na agregaty →
> rozjazdy model↔kod → ranking.

## Krok 0 — Kontekst projektu (odkrycie)

- **Brak `prd.md` / `foundation/docs`** — to nie jest projekt bootstrapowany z 10x.
  Dokumenty wymagań, na których opiera się ta destylacja, to **warstwowe `AGENTS.md`**
  (root + per-moduł) oraz `.ai/specs/`. **Ograniczenie**: nie ma jednego dokumentu wizji
  produktu — Ubiquitous Language wyciągam z `AGENTS.md` (intencja) + kodu (realizacja),
  i wszędzie zaznaczam rozjazd.
- **Stack**: monorepo Next.js (`apps/mercato`) + pakiety `@open-mercato/*`; MikroORM v7 +
  Postgres; DI (Awilix); wzorzec Command dla zapisów domenowych.
- **Gdzie żyje logika biznesowa** (warstwy):
  - API/route: `packages/core/src/modules/<m>/api/**` (cienkie, ale `customers/api/people/[id]` to wyjątek — 1203 linie)
  - domena/aplikacja: `packages/core/src/modules/<m>/commands/**` + `services/**`
  - persystencja: `packages/core/src/modules/<m>/data/entities.ts` (MikroORM)
  - UI: `backend/**`, `components/**`
- **Najbogatsza domena**: `sales` — `packages/core/src/modules/sales/AGENTS.md` deklaruje
  wprost: *"This module has the most complex business logic in the system."*

## Krok 1 — Ubiquitous Language

Pojęcia wyciągnięte z dokumentów ORAZ z kodu (nie wymyślone — z cytatem źródła i miejsca w kodzie):

| Pojęcie | Definicja (wg źródła) | Cytat źródłowy | Gdzie w kodzie |
|---|---|---|---|
| **Quote → Order → Invoice (Document Flow)** | Kanoniczny przepływ dokumentu sprzedaży; „no skipping steps" | `sales/AGENTS.md` (§ Document Flow) | `sales/commands/documents.ts` (convert-to-order ~`:4416`, `:4576`) |
| **Sales Order** | Potwierdzone zamówienie; „MUST have a channel and at least one line" | `sales/AGENTS.md` (§ Data Model Constraints) | `sales/data/entities.ts:326` (`SalesOrder`) |
| **Order Line** | Pozycja zamówienia; „MUST reference valid products" | `sales/AGENTS.md` | `sales/data/entities.ts:548` (`SalesOrderLine`) |
| **Sales Quote** | Proponowane zamówienie; „MUST track conversion status" | `sales/AGENTS.md` | `sales/data/entities.ts:822` (`SalesQuote`) |
| **Invoice / Credit Memo** | Dokument rozliczeniowy / korekta | `sales/AGENTS.md` | `entities.ts:1379` / `:1543` |
| **Payment / Payment Allocation** | Zarejestrowana płatność i jej rozksięgowanie na order/invoice | kod | `entities.ts:1695` / `:1760` |
| **Adjustment (Kind)** | Rabaty/dopłaty; „MUST use registered `AdjustmentKind`" | `sales/AGENTS.md` | `entities.ts:689` (`SalesOrderAdjustment`) |
| **Channel** | Kanał sprzedaży; wpływa na pricing, numerację, widoczność | `sales/AGENTS.md` (§ Channel Scoping) | `entities.ts:12` (`SalesChannel`) |
| **salesCalculationService** | JEDYNE miejsce matematyki dokumentu; „Never reimplement document math inline" | `sales/AGENTS.md` (§ Always #1) | `sales/services/` + `lib/calculations.ts` |
| **Customer Entity (person/company)** | Polimorficzny rekord CRM (`kind: 'person'|'company'`) | root `AGENTS.md` + research | `customers/data/entities.ts` (`CustomerEntity`) |
| **Deal / Interaction / Activity** | Byty CRM wokół klienta | kod | `customers/data/entities.ts` |
| **Command (pattern)** | Zapis domenowy z audytem/undo/cache/events/indexem | core `AGENTS.md` (§ Command Side Effects) | `*/commands/*.ts` |
| **Optimistic Lock (`updated_at`)** | Ochrona przed cichą utratą edycji; default ON | root `AGENTS.md` | `shared/lib/crud/optimistic-lock*.ts` |
| **Outstanding amount** | Kwota pozostała do zapłaty = grandTotal − paid + refunded, **clamp do 0** | kod | `sales/commands/payments.ts:316` |
| **Tenant / Organization scope** | Każda encja tenant-scoped; „Never expose cross-tenant data" | root `AGENTS.md` | wszędzie: `organizationId`/`tenantId` |

## Krok 2 — Subdomeny: Core / Supporting / Generic

Klasyfikacja względem sensu produktu (e-commerce/ERP — wartość = obsługa cyklu sprzedaży i relacji z klientem):

| Obszar | Kategoria | Uzasadnienie |
|---|---|---|
| **sales** (order lifecycle, document math, payments) | **Core** | To *jest* produkt: cykl Quote→Order→Invoice + rozliczenia. Najbogatsza logika, najwięcej niezmienników. |
| **customers** (CRM: person/company/deals) | **Core** | Drugi rdzeń — relacja z klientem; #1 moduł wg aktywności (3177 zmian/12 mies., `artifact-1`). |
| **catalog** (produkty, pricing, `selectBestPrice`) | **Supporting** | Wspiera sales (ceny pozycji), ale nie jest sam celem; współdzielony przez wiele przepływów. |
| **auth / RBAC** | **Supporting** | Konieczne do bezpieczeństwa wielodostępu, ale generyczne dla każdej aplikacji biznesowej. |
| **dictionaries / workflows / currencies** | **Supporting** | Konfiguracja statusów, automatyzacje, wielowalutowość — obsługują rdzeń. |
| **search / cache / queue / events / encryption / attachments** | **Generic** | Infrastruktura niewyróżniająca produktu; resolvowane przez DI (porty wymienne). |

## Krok 3 — Kandydaci na agregaty i ich niezmienniki

| Kandydat (root) | Niezmiennik (MUSI być prawdziwy) | Cytat | Status egzekucji |
|---|---|---|---|
| **SalesOrder** | Σ allocations płatności ≤ grandTotal (brak cichej nadpłaty) | wynika z `outstanding = max(grandTotal − paid + refunded, 0)` `payments.ts:316` | **IGNOROWANY** — clamp zamiast odrzucenia; brak guardu w `createPaymentCommand` `payments.ts:327` |
| **SalesOrder** | grandTotal = f(lines, adjustments, tax) liczone JEDYNIE przez `salesCalculationService` | `sales/AGENTS.md` „Never reimplement document math inline" | **deklarowany**; egzekwowany przez konwencję, nie typ |
| **SalesOrder** | Order ma kanał i ≥1 linię; linie referują istniejące produkty | `sales/AGENTS.md` (§ Data Model Constraints) | deklarowany (walidatory `data/validators.ts`) |
| **Sales Document (flow)** | Order nie powstaje bez quote (jeśli flow tego wymaga); brak skoków stanów | `sales/AGENTS.md` (§ Document Flow) | **konfigurowalny** — `quoteId` nullable (`documents.ts:191`) |
| **CustomerEntity** | `kind` spójny z istnieniem profilu (person↔`CustomerPersonProfile`) | research `post-flow-analysis` | deklarowany; rejestracja readerów ręczna (`customers/di.ts`) |
| **Edytowalna encja** | Brak cichej utraty edycji równoległych (`updated_at`) | root `AGENTS.md` (optimistic locking) | **egzekwowany** (default ON + dwa testy-guard) |

## Krok 4 — Rozjazdy MODEL vs KOD (najcenniejsza część)

| # | Dokument mówi (X) | Kod robi (Y) | Dowód (plik:linia) |
|---|---|---|---|
| D1 | Nadpłata to błąd biznesowy (kwota „pozostała do zapłaty" istnieje) | Nadpłata jest **cicho połykana** — `outstanding` clampowany do 0, brak odrzucenia w command | `payments.ts:316`, `payments.ts:327-434` (brak preconditiona) |
| D2 | „NO direct ORM relationships between modules" | `sales` statycznie importuje encje `customers` (2 pliki); `customers/api/*` importuje `User` z `auth` (7 plików) | root `AGENTS.md`; `research.md` (C1), `documents.ts:64-68` |
| D3 | Cienkie route'y; CRUD przez `makeCrudRoute` | Detal `GET /people/[id]` hand-rolled, 1203 linie, 0 testów handlera | `customers/api/people/[id]/route.ts`; `research.md` (C4) |
| D4 | Math dokumentu tylko przez `salesCalculationService` | Niezmiennik nadpłaty żyje *poza* tym serwisem (w `payments.ts`), więc nie jest objęty „jednym miejscem matematyki" | `payments.ts:251-325` |
| D5 | Order nie powstaje bez source quote | `quoteId` nullable — flow „direct order" możliwy zależnie od konfiguracji, niezmiennik nie jest twardy | `documents.ts:191` |

## Krok 5 — Ranking refaktoru

Szeregowanie wg (wartość = jak rdzeniowy niezmiennik) × (ryzyko = jak słabo egzekwowany):

1. **#1 — SalesOrder: zakaz cichej nadpłaty (D1).** Najwyższa wartość (dotyka pieniędzy,
   rdzeń produktu) **i** najsłabsza egzekucja (clamp do 0, brak guardu, math poza
   `salesCalculationService`). To jednocześnie naruszenie D4. → przedmiot
   `02-invariant-aggregate-refactor.md`.
2. **#2 — Cross-module ORM entity imports (D2).** Rdzeniowa zasada architektury, naruszana
   w 9 plikach; już rozpisana w `context/changes/refactor-opportunities` (C1, częściowo
   wdrożone). Powiązana z ACL → `03-anti-corruption-layer.md`.
3. **#3 — Hand-rolled people detail (D3).** Wysoki dług strukturalny, ale niższe ryzyko
   domenowe (kształt odpowiedzi stabilny); pierwszy krok już wdrożony (C4).

## Podsumowanie

Open Mercato ma dwa rdzenie domenowe — **sales** (cykl Quote→Order→Invoice + rozliczenia)
i **customers** (CRM) — osadzone na wspólnym kernelu CRUD/DI/Command i warstwie infrastruktury
generycznej (search/cache/queue). Ubiquitous Language jest spójny i dobrze udokumentowany w
warstwowych `AGENTS.md`, ale nie ma jednego dokumentu wizji (ograniczenie tej destylacji).
Najsilniejszym kandydatem na agregat-strażnika jest **SalesOrder**, bo skupia kilka
niezmienników rdzeniowych, z których najgroźniejszy — *zakaz cichej nadpłaty* — jest dziś
ignorowany (kwota nadpłaty clampowana do zera zamiast odrzucenia, a matematyka żyje poza
`salesCalculationService` wbrew deklaracji modułu). Drugi w kolejności rozjazd to
cross-module importy encji ORM, które łamią twardą zasadę architektury i prowadzą wprost do
analizy warstwy antykorupcyjnej. Najcenniejszym wnioskiem jest lista pięciu rozjazdów
model↔kod (D1–D5): pokazuje dokładnie te miejsca, gdzie wiedza domenowa jest zadeklarowana,
ale kod jej nie odwzorowuje.
