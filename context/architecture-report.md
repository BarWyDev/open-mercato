---
title: Raport architektoniczny — Open Mercato
created: 2026-06-21
author: Bartosz Wysocki
type: architecture-report
sources:
  - context/map/repo-map.md (L2 — mapa repozytorium)
  - context/changes/post-flow-analysis/research.md (L3 — research ficzera)
  - context/changes/refactor-opportunities/plan.md (L4 — plan refaktoru)
  - context/domain/{01,02,03}.md (L5 — notatki o domenie / DDD)
---

# Raport architektoniczny — Open Mercato

Zwięzła synteza czterech artefaktów modułu 4. Każda teza jest podparta zweryfikowanym
`plik:linia` w artefakcie źródłowym — to raport, który potrafię obronić, nie streszczenie
przyjęte na wiarę.

## 1. Co to za system (mapa — L2)

Open Mercato to **modularny monorepo** (Next.js `apps/mercato` + pakiety `@open-mercato/*`):
platforma e-commerce/CRM/ERP zbudowana wokół jednego silnika CRUD (`makeCrudRoute` + kontener
DI) i wspólnej warstwy UI (`CrudForm`/`DataTable`/`AppShell`). Realna praca koncentruje się w
modułach domenowych — w 12 mies. najcięższe były `customers` (3177 zmian), `ui/backend` (1737),
`sales` (1688), `catalog`, `auth`, `shared/lib`.

Mapa (`context/map/repo-map.md`) wskazuje **trzy strefy bólu**, krzyżując trzy źródła dowodów
(co-change z gita, graf importów `dependency-cruiser`, rejestry-switchboard):

1. **Kernel SCC** w `shared/lib` (`crud/factory ↔ di/container ↔ commands ↔ optimistic-lock`),
   od którego zależy każdy route CRUD — granica `no-circular` jest tylko `warn`.
2. **Cross-module importy encji ORM** (`catalog↔sales↔customers↔auth`) — łamią twardą zasadę
   „NO direct ORM relationships between modules", a pokrywają się 1:1 z najwyższymi parami
   co-change.
3. **Nowe moduły Q3** (`customer_accounts`, `ai_assistant`) rosnące szybko i częściowo omijające
   wzorzec CRUD-factory.

## 2. Jak działa rdzeń (research ficzera — L3)

Prześwietliłem kanoniczny przepływ — **Person CRUD w `customers`** (moduł referencyjny). Trace
e2e, luki w testach i blast radius (`context/changes/post-flow-analysis/research.md`) pokazują, że
moduł jest „podręcznikowym" konsumentem kernela, ale z **trzema udokumentowanymi odstępstwami**,
które każdy nowy moduł kopiujący wzorzec powtarza świadomie lub nie:

- detal `GET /people/[id]` jest **hand-rolled (1203 linie)**, poza `makeCrudRoute`, bez testu
  głównego handlera;
- edycja idzie **per-pole przez `useGuardedMutation`**, nie `CrudForm`;
- blast radius potwierdza strefę #2 mapy jako **realną, skompilowaną** zależność:
  `sales/commands/documents.ts:64-68` statycznie importuje encje `customers`; 7 plików
  `customers/api/*` importuje `User` z `auth`.

Wartość metodyczna tego artefaktu: pas **weryfikacji ast-grep** *obalił* część własnych
wcześniejszych twierdzeń (bug pluralizacji `resourceKind` #2072 jest naprawiony; „12 route'ów"
to faktycznie 7) — dowód, że raport jest sprawdzony, nie wygenerowany.

## 3. Co i w jakiej kolejności naprawić (plan — L4)

`context/changes/refactor-opportunities/` klasyfikuje dług na 6 kandydatów i szereguje top 3 z
trade-offami, blast radiusem i „pierwszym krokiem" o niskim ryzyku. Plan został **wdrożony**
(Progress odhaczony do commitów):

| # | Refaktor | Pierwszy krok (wdrożony) |
|---|---|---|
| C1 | Cross-module `customers→auth` (D2) | współdzielony `CustomerUserSummary` loader; migracja `activities/route.ts` (`5d631ae26`) |
| C4 | Hand-rolled detail (D3) | ekstrakcja `loadPersonDetailCustomFields` + pierwszy test routy (`95cf63c5e`) |
| C5 | Per-field edit (D3) | ekstrakcja hooka `usePersonGuardedMutation` + test (`ae887fe4f`) |

Świadomie *odłożone* (z uzasadnieniem): C2 (kernel SCC — wymaga osobnego researchu), C3
(hand-wired readery — to luka testowa, nie refaktor), C6 (cykl `PersonCard` — type-only,
boy-scout).

## 4. Domena pod spodem (DDD — L5)

Destylacja (`context/domain/01-domain-distillation.md`) ustala dwa **rdzenie**: `sales`
(cykl Quote→Order→Invoice + rozliczenia) i `customers` (CRM), na warstwie wspierającej
(auth/catalog/dictionaries) i generycznej (search/cache/queue/encryption). Najcenniejszy wynik
to lista pięciu **rozjazdów model↔kod (D1–D5)** — miejsc, gdzie `AGENTS.md` deklaruje regułę,
a kod jej nie odwzorowuje.

Dwa z nich rozpisałem w plany refaktoru DDD:

- **D1 — zakaz cichej nadpłaty na `SalesOrder`** (`02-invariant-aggregate-refactor.md`). Niezmiennik
  rdzeniowy (pieniądze) i najsłabiej egzekwowany: `recomputeOrderPaymentTotals` clampuje
  `outstanding = Math.max(grandTotal − paid + refunded, 0)` (`payments.ts:316`), a
  `createPaymentCommand` (`payments.ts:327-434`) nie ma żadnego preconditiona kwoty —
  nadpłata jest **połykana**, nie odrzucana. Projekt: agregat `Order` jako jedyny strażnik,
  `registerPayment()` rzucający `OverpaymentError` (fail-fast).
- **D2/ACL — MikroORM przeciekający przez wszystkie warstwy** (`03-anti-corruption-layer.md`).
  ~626 plików zna ORM; jego dekoratory definiują same encje domenowe (`entities.ts:1-2`). Wzorzec
  docelowy istnieje już w repo: `gateway-stripe` izoluje `stripe` w 3 plikach z testami izolacji.
  Projekt: wąski `OrderRepository` (port) + `MikroOrmOrderRepository` (adapter), scoped do
  agregatu `Order` — co domyka także D1.

## 5. Synteza — jedna nić przewodnia

Wszystkie cztery artefakty zbiegają się w **tym samym miejscu**: granice między modułami i między
domeną a infrastrukturą są w Open Mercato **zadeklarowane mocniej niż egzekwowane**. Mapa widzi to
jako `warn` zamiast `error` i cross-module importy; research potwierdza je jako skompilowane
zależności na żywym przepływie; plan zaczyna je rozplatać od najmniejszego ryzyka; a soczewka DDD
nazywa przyczynę — niezmienniki rdzeniowe (nadpłata) i zależności (ORM) nie mają jednego miejsca
egzekucji.

**Rekomendowany następny ruch** (najwyższa wartość × dziś najsłabsza egzekucja):
wdrożyć agregat-strażnika `SalesOrder` z niezmiennikiem nadpłaty (artefakt 02), bo jego
repozytorium jest jednocześnie pierwszym realnym ACL dla MikroORM (artefakt 03) — jeden refaktor
domyka dwa rozjazdy naraz.

## Ograniczenia

- Brak `prd.md`/dokumentu wizji — Ubiquitous Language i subdomeny wyprowadzone z `AGENTS.md` +
  kodu (odnotowane w L5).
- Mapa to migawka (2026-06-10/11); `dependency-cruiser` obejmuje tylko `packages` + `apps/mercato/src`,
  reguły są `warn` i nie biegną w CI.
- Plany 02/03 to projekty, nie implementacja; pełne usunięcie MikroORM jest poza zakresem (ACL
  celowo wąski, per-agregat).
