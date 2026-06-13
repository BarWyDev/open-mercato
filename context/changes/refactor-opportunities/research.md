---
date: 2026-06-12T17:57:15+00:00
researcher: Claude (claude-sonnet-4-6)
git_commit: be1df535b3f51980a67070ead9683c84f8b3174c
branch: feature/10x-dev-architect-exercise
repository: open-mercato
topic: "Refactor opportunities: ranking technical debt from post-flow-analysis"
tags: [research, codebase, customers, refactor, technical-debt, ranking, verified]
status: complete
last_updated: 2026-06-12
last_updated_by: Claude (claude-sonnet-4-6)
last_updated_note: "Added ast-grep/grep verification pass for structural claims underpinning the ranking"
verification_commit: be1df535b3f51980a67070ead9683c84f8b3174c
---

# Research: Refactor opportunities from post-flow analysis

**Date**: 2026-06-12T17:57:15+00:00
**Researcher**: Claude (claude-sonnet-4-6)
**Git Commit**: be1df535b3f51980a67070ead9683c84f8b3174c
**Branch**: feature/10x-dev-architect-exercise
**Repository**: open-mercato

## Research Question

> Przeczytaj analizę `context/changes/post-flow-analysis/research.md` (dług techniczny i ryzyka strukturalne modułu `customers`/Person CRUD). Wypisz każdy problem, klasyfikuj jako KANDYDAT (naprawa zmieniłaby strukturę kodu) lub nie. Zbadaj każdego kandydata trzema wymiarami (obecny kształt / historia i intencjonalność / wykonalność migracji), bez zmian w kodzie. Zsyntetyzuj w research.md z rankingiem 2-3 najmocniejszych kandydatów.

Priors read: `context/map/repo-map.md`, `artifact-1-territory.md`, `artifact-2-structure.md`, `artifact-3-contributors.md`, oraz `context/changes/post-flow-analysis/research.md` w pełni.

## Candidate inventory & classification

Z `post-flow-analysis/research.md`, sekcja "Technical debt" (12 pozycji). KANDYDAT = naprawa zmieniłaby strukturę kodu (architektura/abstrakcje/sprzężenia); pozostałe = wejście do oceny kosztu, nie przedmiot refaktoru.

### Kandydaci (KANDYDAT)

| ID | Źródło | Opis |
|---|---|---|
| **C1** | Debt #1 | Cross-module ORM entity imports: `sales→customers` (`documents.ts`, `seed/examples.ts`), `customers→auth` (7 plików importuje `User`), `customer_accounts→customers` (dynamic imports). `core-no-cross-module-entity-imports` = `warn`. |
| **C2** | Debt #2 | Kernel SCC (`crud/factory.ts ↔ di/container.ts ↔ commands/index.ts ↔ auth/server.ts ↔ optimistic-lock.ts`) jako twarda zależność `customers`. |
| **C3** | Debt #4 | Hand-wired optimistic-lock readery w `di.ts` zależne od kolejności ładowania modułu względem `makeCrudRoute`. |
| **C4** | Debt #5 | Hand-rolled detail `GET /api/customers/people/[id]` (1203 linii), poza pipeline factory (enrichers/interceptors/profiler). |
| **C5** | Debt #6 | Edycja Person per-pole przez `useGuardedMutation` + ręczny `buildOptimisticLockHeader`/`surfaceRecordConflict`, nie `CrudForm` — wzorzec powtórzony 3x na stronie. |
| **C6** | Debt #12 | Cykl komponentów `PersonCard ↔ CompanyPeopleSection` w najczęściej zmienianym podkatalogu (441 zmian/6mies.). |

### Nie-kandydaci (wejście do feasibility/cost)

| ID | Źródło | Dlaczego nie kandydat |
|---|---|---|
| **N1** | Debt #3 | Martwy kod `RESOURCE_KIND_PEOPLE` + nieaktualny komentarz w `di.ts:9-17,64` — trywialny cleanup, nie zmiana struktury. |
| **N2** | Debt #7 | Brak testu cross-tenant isolation dla `people` CRUD — luka w testach. |
| **N3** | Debt #8 | Custom-fields undo broken dla person (#2498) — znany, śledzony bug, nie pytanie o strukturę. |
| **N4** | Debt #9 | ~10 nieprzetestowanych branchy filtrów listy (`api/people/route.ts:186-339`) — luka w testach. |
| **N5** | Debt #10 | Kaskadowy `nativeDelete` (~10 tabel) bez asercji post-conditions — luka w testach. |
| **N6** | Debt #11 | Drugi, legacy plik snapshotu migracji (`.snapshot-openmercato.json`) — cleanup zbłąkanego pliku, nie zmiana struktury kodu. |

## Per-candidate analysis

Każdy kandydat zbadany trzema sub-agentami w trybie eksploracji (bez zmian w kodzie): (1) obecny kształt, (2) historia i intencjonalność, (3) wykonalność migracji. Twierdzenia oznaczone `[evidence: file:line]`, `[inference]` lub `[unknown]` pochodzą z raportów sub-agentów; gdzie orchestrator (ja) dodatkowo zweryfikował twierdzenie własnym `grep`/`Read`, oznaczone `[verified by orchestrator]`.

---

### C1 — Cross-module ORM entity imports

**Obecny kształt:**

- `sales/commands/documents.ts:64-68` importuje `CustomerAddress`, `CustomerEntity`, `CustomerPersonProfile` [evidence]. Funkcje `resolveCustomerSnapshot()`/`resolveAddressSnapshot()` wołają `em.findOne(CustomerEntity, ...)` (linia 662), `em.findOne(CustomerPersonProfile, ...)` (linia 670), `em.findOne(CustomerAddress, ...)` (linia 722) — wyłącznie odczyt, serializacja do snapshotów na potrzeby undo [evidence].
- `sales/seed/examples.ts:33-37` importuje te same 3 encje do budowy przykładowych zamówień z realnymi rekordami klientów [evidence].
- 6 plików w `customers/api/*` (raport: 7 plików `customers/api/*`) importuje `User` z `auth/data/entities`, wyłącznie do odczytu (`.name`/`.email`/`.phone` do wyświetlenia właściciela/autora): `entity-roles-factory.ts:11`, `interactions/route.ts:18`, `companies/[id]/route.ts:24`, `deals/[id]/route.ts:17`, `activities/route.ts:20`, `people/[id]/route.ts:22`. Siódmy import jest w `customers/lib/interactionReadModel.ts:8` (poza `api/*` — patrz punkt poniżej); łącznie **7 plików w module `customers`**, ale tylko **6 w `api/*`** [evidence, potwierdzone ast-grep + grep w "Weryfikacja twierdzeń"].
- `customer_accounts/subscribers/{autoLinkCrm,autoLinkCrmReverse}.ts`, `lib/customerEntityOwnership.ts` — dynamiczne `await import('@open-mercato/core/modules/customers/data/entities')`, 3 pliki / 6 wywołań [evidence].
- `.dependency-cruiser.cjs:40-42` — `core-no-cross-module-entity-imports`, `severity: 'warn'`, z komentarzem wyłączającym leniwe `await import(...)` jako "escape hatch" [evidence]. Plik `.dependency-cruiser.cjs` jest **untracked** w repo (`git status` → `??`) [verified by orchestrator].
- `customers/lib/interactionReadModel.ts` NIE jest opublikowanym read-modelem cross-module — sam importuje `User` z `auth/data/entities` na linii 8 i lokalne encje `customers`, hydratując DTO `InteractionRecord` [evidence]. Brak jakiegokolwiek innego `*ReadModel`/DTO eksportu dla cross-module entity access [evidence — grep `ReadModel` w `packages/core/src/modules` zwraca tylko ten plik].
- **Korekta (sprawdzona przez orchestratora)**: sub-agent feasibility zgłosił `sales/inbox-actions.ts` jako NOWY, nieudokumentowany przypadek importu encji `customers`. Po weryfikacji: `inbox-actions.ts` importuje `resolveCustomerEntityIdByEmail` z `packages/core/src/modules/inbox_ops/lib/executionHelpers.ts`, który rozwiązuje `CustomerEntity` **dynamicznie przez `resolveEntityClass(ctx, 'CustomerEntity')`** (rozwiązanie klasy encji po nazwie w runtime, nie statyczny import z `customers/data/entities`) [verified by orchestrator: `packages/core/src/modules/inbox_ops/lib/executionHelpers.ts:367-421`]. **To NIE jest nowa naruszenie reguły `core-no-cross-module-entity-imports`** — odrzucone jako blast-radius finding.

**Historia i intencjonalność:**

- `.dependency-cruiser.cjs` jest bez historii gita (untracked) — nie można odtworzyć, czy reguła była kiedyś `error`. Od momentu dodania jest `warn` [evidence].
- Zasada "NO direct ORM relationships between modules" w AGENTS.md jest stara (obecna od `158e53479`, "Create new AGENTS.md files structure", #492) i poprzedza istnienie pliku konfiguracji depcruise [evidence].
- **WERDYKT: accidental complexity** — zasada architektoniczna jest świadoma i od dawna dokumentowana, ale konkretne naruszenia narastały organicznie w wielu commitach feature'owych (era SPEC-046 i wcześniej) przed istnieniem jakiegokolwiek automatycznego sprawdzenia; sam check, gdy powstał, od razu jako `warn` — pragmatyczne złagodzenie wobec istniejącego długu, nie świadomy trade-off dla TYCH konkretnych importów.

**Wykonalność migracji:**

- Brak istniejącej abstrakcji read-model/DTO dla cross-module entity access — migracja wymaga NOWEJ abstrakcji (choć `interactionReadModel.ts` daje wzorzec "hydration helper → DTO" do uogólnienia) [evidence].
- Blast radius (re-check): `sales` — **2 pliki** importują `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress` statycznie (`documents.ts`, `seed/examples.ts`; confirmed: depcruise repo-wide raportuje dokładnie 2 krawędzie `sales→customers/data/entities`); `customers` — **7 plików** importuje `User` z `auth`, z czego **6 w `api/*`, 1 w `lib/interactionReadModel.ts` (raport: 7 plików `customers/api/*`)**; `customer_accounts` — 3 pliki / 6 wywołań dynamic import (już zgodne z regułą) [evidence + verified by orchestrator dla odrzucenia `inbox-actions.ts`].
- `yarn depcruise` **nie działa w CI** (`.github/workflows/ci.yml` nie zawiera `depcruise`/`dependency-cruiser`) [verified by orchestrator]. Repo-wide `yarn depcruise` zwraca **216 ostrzeżeń, 0 błędów**; `core-no-cross-module-entity-imports` wnosi dziesiątki trafień w wielu parach modułów (`customers`, `catalog`, `auth`, `audit_logs`, `api_keys`, `communication_channels`, `customer_accounts`, `configs`), nie tylko w trio `customers/sales/auth` [evidence]. Podniesienie tej reguły do `error` dziś złamałoby build repo-wide, nie tylko to trio.
- **Pierwszy krok-prerekwizyt**: zdefiniować mały DTO (np. `CustomerUserSummary`) + loader w `customers/lib/` (wzorem hydratora z `interactionReadModel.ts`) i przepisać NA NIM jeden z 6 plików `customers/api/*` (najmniejszy blast radius, np. `activities/route.ts`) — bez usuwania importu `User` z pozostałych 5 plików `api/*` + `lib/interactionReadModel.ts` (raport: "z pozostałych 6"). Nie dotyka `sales` (ryzykowniejszy kierunek).

---

### C2 — Kernel SCC jako twarda zależność `customers`

**Obecny kształt:**

- `packages/shared/src/lib/crud/factory.ts` importuje `createRequestContainer` z `di/container.ts` (linia 3) i typy z `commands` (linia 44); linia 952 woła `createGenericOptimisticLockReader()` [evidence].
- `packages/shared/src/lib/di/container.ts` importuje `CommandBus` z `commands` i `createOptimisticLockGuardService` z `crud/optimistic-lock.ts` (linie 7, 9) oraz `getAllOptimisticLockReaders` z `optimistic-lock-store.ts` (linia ~9-10) [evidence].
- `packages/shared/src/lib/auth/server.ts` (ścieżka realna: `@open-mercato/shared/lib/auth/server`, nie `core/modules/auth`) importuje tylko z `db/mikro` (infrastruktura), **brak importów z factory/container/commands** — linia 2 [evidence].
- `packages/shared/src/lib/crud/optimistic-lock.ts` importuje tylko z `optimistic-lock-headers`/`optimistic-lock-store` (linie 33-46) — samowystarczalny [evidence].
- **Doprecyzowanie cyklu**: rzeczywisty cykl jest skoncentrowany w **2-3 plikach** (`factory.ts ↔ di/container.ts ↔ optimistic-lock-store.ts`), nie w pełnym 5-wierzchołkowym cyklu wzajemnym jak sugerował repo-map. `commands/index.ts` ma ~463 bajty — praktycznie pusty, prawdopodobnie tylko re-eksport typów [evidence].
- `customers/di.ts:61-65` rejestruje hand-wired readery przez `registerOptimisticLockReaders({...})` w momencie ładowania modułu [evidence].
- `customers`: **44 pliki** importują `di/container` (raport: 43), **36 plików** importują `auth/server` (raport: 35) [evidence — `grep -rl` po pakietowej ścieżce importu]. Te importy są **liściami konsumującymi** kernel, nie uczestniczą w samym cyklu [inference].

**Historia i intencjonalność:**

- Commit `d1d9f361c` ("fix: errors due to circular dependencies causing TDZ violations (#283)", Patryk Andrzejewski, 2025-01-07) dotyczy ogólnego DI container/module-registry load-ordering, **przed** migracją do monorepo (`03b1a6c5a`, #320, 2026-01-16) — nie odnosi się bezpośrednio do TEGO cyklu opisanego w research.md [evidence].
- Brak commitów dyskutujących "circular"/"SCC"/"cycle" dla `factory.ts`/`di/container.ts` w kontekście obecnego cyklu [evidence — wynik grepa po komunikatach commitów].
- `.dependency-cruiser.cjs` (`no-circular` = `warn`) jest bez historii gita (untracked) [evidence].
- **WERDYKT: unknown** — dowód na wcześniejszą walkę z problemami TDZ/circular istnieje (#283), ale brak dowodu na świadomą decyzję o akceptacji TEGO konkretnego cyklu jako "load-bearing". Prawdopodobnie narastał z funkcjami optimistic-locking (#1981/#2055), ale żaden commit tego nie dyskutuje.

**Wykonalność migracji:**

- `no-circular` = `warn`, depcruise nie działa w CI → czysto poradawcze [verified by orchestrator]. Repo-wide `yarn depcruise` zgłasza **78 wystąpień** `no-circular` (część z 216 ostrzeżeń łącznie) [evidence].
- Istniejące testy jednostkowe: `packages/shared/src/lib/crud/__tests__/{optimistic-lock,optimistic-lock-store,optimistic-lock-command,cache,crud-factory.enricher-cache,custom-fields.cache}.test.ts` — solidne pokrycie `optimistic-lock*` i cache/resourceKind w `factory.ts`. **Brak dedykowanego `di/container.test.ts`** [evidence].
- Skoro 44+36 importerów w `customers` (raport: 43+35) to liście poza cyklem, rozplecenie SCC wymagałoby zmiany TYLKO wzajemnych importów 2-3 plików kernela (`factory.ts`, `di/container.ts`, `optimistic-lock-store.ts`), nie tych 80 importerów — przy zachowaniu stabilnych publicznych ścieżek/sygnatur (`BACKWARD_COMPATIBILITY.md`) [inference].
- **Pierwszy krok-prerekwizyt**: zweryfikować (osobny depcruise scoped na `optimistic-lock-store.ts`), czy ten plik ma już ZERO importów z powrotem do `factory.ts`/`di/container.ts` — jeśli tak, "seam" już istnieje i wystarczy upewnić się, że `customers/di.ts` importuje WYŁĄCZNIE z `optimistic-lock-store.ts`, nie głębiej w cykl. To krok weryfikacyjny/dokumentacyjny, nie zmiana kodu.

---

### C3 — Hand-wired optimistic-lock readery / zależność od kolejności ładowania

**Obecny kształt:**

- `customers/di.ts:61-65` — `registerOptimisticLockReaders({...})` na poziomie modułu, rejestruje `readCustomerPersonUpdatedAt`/`readCustomerCompanyUpdatedAt` [evidence].
- `packages/shared/src/lib/crud/optimistic-lock-store.ts:45-50` — `registerOptimisticLockReaders` zapisuje do globalnego rejestru `__openMercatoOptimisticLockReaders__` [evidence]. Linie 61-75 — `registerOptimisticLockReaderIfAbsent` — rejestruje TYLKO jeśli klucz jeszcze nie istnieje [evidence].
- `factory.ts` (linia ~952-963) — `createGenericOptimisticLockReader()` + `registerOptimisticLockReaderIfAbsent` jako fallback wewnątrz `makeCrudRoute`, czyli w momencie konfiguracji route'a [evidence].
- **Mechanizm porządku ładowania**: `customers/di.ts` musi wykonać się PRZED `makeCrudRoute(...)` w `api/people/route.ts` poprzez porządek ładowania modułów (rejestratorzy DI uruchamiani podczas bootstrap, przed routingiem HTTP) [inference — konkretna logika bootstrap w `apps/mercato` nie była śledzona linia-po-linii].
- **Wzorzec NIE jest jednorazowy**: `registerOptimisticLockReaders(` jest wołane w 3 modułach — `customers/di.ts:61`, `sales/di.ts:67`, `workflows/di.ts:27` [verified by orchestrator: `grep -rn "registerOptimisticLockReaders(" packages/core/src/modules --include=di.ts`].

**Historia i intencjonalność:**

- `.ai/specs/2026-05-28-optimistic-locking-coverage-completion.md` §3.5.1 ("Reader registry — auto-coverage for every CRUD entity") **opisuje dokładnie ten wzorzec jako zamierzony, dwupoziomowy extension point**: *"Hand-wired specific: Module's `di.ts` calls `registerOptimisticLockReaders({…})` during DI bootstrap (before any route file is imported)... Hand-wired readers WIN because they register first and the auto-registration uses the `IfAbsent` helper."* Tabela decyzyjna (linia ~403) potwierdza: *"B-tier entities keep their hand-wired readers as polymorphic-table overrides"* dla `customers.company`/`customers.person`/`sales.order` [evidence].
- `git log -- packages/core/src/modules/customers/di.ts` → commit `9c4dba71e` (#1981/#2055, rollout optimistic-locking OSS) — migracja z inline readerów na wzorzec store, z notatkami debugowania o wyścigach rejestracji Awilix "last-write-wins" między `customers/di.ts` i `sales/di.ts` [evidence].
- **WERDYKT: deliberate constraint** — wzorzec jest explicite nazwany, zaprojektowany i uzasadniony w spec jako zamierzony mechanizm dla encji polimorficznych; zależność od kolejności (rejestracja-przed-route) jest znaną, akceptowaną konsekwencją projektu "hand-wired WINS", nie przeoczeniem.

**Wykonalność migracji:**

- `optimistic-lock-store.test.ts` testuje kontrakt API store'a (`registerOptimisticLockReaders`/`registerOptimisticLockReaderIfAbsent`/merge/override) w izolacji, **nie** rzeczywisty wyścig porządku ładowania `di.ts` vs `makeCrudRoute` [evidence]. `cache.test.ts` pokrywa tylko `deriveResourceFromCommandId`/`singularizeSegment` (#2072), niezwiązane [evidence].
- Skoro wzorzec powtarza się w 3 modułach (`customers`, `sales`, `workflows`), poprawka byłaby bezpośrednio szablonowalna [evidence — potwierdzone grepem przez orchestratora].
- **Pierwszy krok-prerekwizyt**: test startup/integration, który importuje `customers/di.ts` (wyzwalając rejestrację), następnie konstruuje route `customers/api/people`, i asercjuje, że `getAllOptimisticLockReaders()['customers.person']` to hand-wired `readCustomerPersonUpdatedAt`, nie generyczny auto-reader. Test mógłby być sparametryzowany dla `sales`/`workflows` jako fast-follow. To nie zmienia `registerOptimisticLockReaders`/`registerOptimisticLockReaderIfAbsent` — czyni niejawne założenie jawnym i testowalnym.

---

### C4 — Hand-rolled detail `GET /api/customers/people/[id]` (1203 linii)

**Obecny kształt:**

- `packages/core/src/modules/customers/api/people/[id]/route.ts` — **1203 linie** (`wc -l`, zgodne z post-flow-analysis) [evidence]. Struktura: importy/metadata/typy (1-48), helpery parsowania i autoryzacji (50-100), helpery agregacji (100-200), główny handler GET budujący kontekst/ładujący osobę/agregujący powiązane encje (200-400+), normalizacja custom fields i serializacja odpowiedzi (400+) [evidence — przybliżone zakresy].
- LIST route (`api/people/route.ts`) używa `makeCrudRoute`. `makeCrudRoute`'s `GET?: CrudMethodMetadata` (factory.ts ~linia 152) to TYLKO metadata trasy (auth/ACL), nie hook handlera; `beforeList`/`afterList` (factory.ts:133-134) dotyczą wyłącznie akcji LIST — **`makeCrudRoute` nie ma ŻADNEGO extension pointu dla detail-GET** [evidence].
- Plik już demonstruje wzorzec dekompozycji: `resolveTodoDetails` (linie ~235-260+) to samodzielny helper `(queryEngine, links, tenantId, organizationIds, profiler) → Map`; `normalizeCustomerDetailCustomFields` jest importowany z sąsiedniego pliku `../../detailCustomFields` [evidence].
- Brak innego `[id]/route.ts` o porównywalnym rozmiarze potwierdzonego w tej sesji [inference — nie mierzono `catalog`/`sales`/`companies` bezpośrednio].

**Historia i intencjonalność:**

- Plik dodany w `7e963217c` ("feat: basic ui", 2025-10-17) jako 189 linii, **od razu hand-rolled** — nigdy nie był `makeCrudRoute` [evidence]. Do `63aa9173e` (SPEC-046a/b, "customers v2", #1050) już importuje `CustomerEntity`, `CustomerPersonProfile`, `CustomerAddress`, `CustomerComment`, `CustomerActivity`, `CustomerTagAssignment`, `CustomerTag`, `CustomerDealPersonLink`, `CustomerDeal`, `CustomerTodoLink`, `CustomerInteraction`, `User` — bogaty agregat cross-entity [evidence].
- Rozrósł się stopniowo przez commity "crm details screens" (`d8504879e`, `40f8e23b1`, `55a84520b`, `efbf6f556`, `86f31838f`, ...) [evidence]. Żaden spec nie dyskutuje "people detail aggregate" jako świadomej alternatywy do `makeCrudRoute` — SPEC-046/046b dotyczą strony (CrudForm), nie kształtu API [evidence].
- **WERDYKT: accidental complexity (z ziarnem oryginalnej intencji)** — decyzja o hand-rollingu zapadła bardzo wcześnie (przed istnieniem idiomów agregacji w `makeCrudRoute` dla tego przypadku) i nigdy nie była zrewidowana; plik organicznie wchłaniał kolejne powiązane dane feature-po-feature bez refleksji nad pipeline factory.

**Wykonalność migracji:**

- `packages/core/src/modules/customers/api/people/__tests__/route.test.ts` pokrywa LIST route, nie `[id]/route.ts`. Katalog `[id]` ma własne `__tests__` tylko dla pod-zasobów: `api/people/[id]/emails/__tests__/route.test.ts`, `api/people/[id]/companies/__tests__/route.test.ts` — **główny handler GET (linie ~393-998) nie ma dedykowanego testu jednostkowego**; pokrycie pochodzi z `TC-CRM-027.spec.ts` (detail GET z powiązaniem firmy) i pośrednio z `TC-UNDO`/`TC-LOCK-OSS` (które odpytują GET po `updatedAt`, choć `TC-LOCK-OSS-002` robi to przez LIST `?id=...`, nie `[id]`) [evidence].
- **Pierwszy krok-prerekwizyt**: ekstrakcja blocku ładowania/scalania/normalizacji custom fields (już używa helperów z sąsiedniego pliku) do jednej nazwanej funkcji o identycznym I/O — zero zmian w kształcie odpowiedzi, z testem kontraktowym/snapshotowym asercjonującym identyczność odpowiedzi GET przed/po. Wzorzec do powtórzenia dla kolejnych sekcji (tags/comments, activities/interactions, deals/companies/todos), każda jako osobny PR.

---

### C5 — Edycja Person: per-field `useGuardedMutation` vs `CrudForm`

**Obecny kształt:**

- Debt #6 z post-flow-analysis dotyczył pliku v1: `backend/customers/people/[id]/page.tsx` — `useGuardedMutation` (import linia 53, init linia 175), użycia w `savePerson` (318-349), `handleDelete` (~398-411), `handleCustomFieldsSubmit` (~447-461), `runMutationWithContext` prop-drillowany do dzieci (linie ~187-195, 850, 875, 900) [evidence].
- **Korekta (sprawdzona przez orchestratorem)**: lista `customers/people/page.tsx` (lista, nie detail) linkuje WYŁĄCZNIE do `/backend/customers/people-v2/${id}` na liniach **630, 918, 937, 942** [verified by orchestrator]. Strona v1 (`people/[id]/page.tsx`) wciąż istnieje jako plik (`page.tsx` + `page.meta.ts`), ale nie jest linkowana z listy [verified by orchestrator].
- `.ai/specs/implemented/SPEC-046-2026-02-25-customer-detail-pages-v2.md:516` — *"`backend/customers/people/[id]/page.tsx` | v1 page remains"* [verified by orchestrator]. Linia 626: ryzyko *"v1 pages still linked from bookmarks/external (Low) — v1 pages remain accessible, consider future redirect"* [verified by orchestrator].
- **`people-v2/[id]/page.tsx` — strona LIVE — wciąż ma resztkę tego samego wzorca, ale w mniejszej skali niż wcześniej oceniono**: importuje `CrudForm` (linia 8), `useGuardedMutation` (linia 26, init linia 103), oraz **2 wywołania `buildOptimisticLockHeader(...)` (raport: "3 wystąpienia")** — linia 365 (wewnątrz `savePerson`, header-field save) i linia 398 (wewnątrz `handleFormDelete`, delete) [verified by orchestrator: `grep -n "buildOptimisticLockHeader("` → 2 wywołania; trzecie "wystąpienie" z poprzedniego liczenia było linią importu `buildOptimisticLockHeader` (linia 15), nie call-site]. Czyli wzorzec debt #6 (per v1: 3x ręczny header/conflict — save/delete/custom-fields) PRZETRWAŁ migrację do v2 w ZREDUKOWANEJ formie: **2 call site'y** (save header-fields + delete), nie 3 — `CrudForm` przejął pola formularza, custom-fields nie ma już własnego `buildOptimisticLockHeader` w v2.
- `packages/ui/src/backend/utils/optimisticLock.ts` ma komentarz dokumentacyjny: *"A future PR may pull them into CrudForm directly once the reference rollout is broader"* [evidence]. `buildOptimisticLockHeader` jest importowany w **110 plikach** repo-wide (raport: "~100 plikach") — wzorzec platformowy, nie lokalny dla tej strony [evidence: `grep -rl "buildOptimisticLockHeader" packages apps/mercato/src --include="*.ts" --include="*.tsx" | wc -l` → 110].

**Historia i intencjonalność:**

- `people/[id]/page.tsx` (v1) powstał w `7e963217c` (2025-10-17), PO istnieniu `CrudForm.tsx` (`8d923d125`, "feat: rudamentory crud", 2025-09-17) — `CrudForm` był dostępny, ale strona od początku użyła per-field inline-edit [evidence].
- SPEC-046 nazywa to Problem #1: *"Per-field inline saves: Each field … saves independently via `updateProfileField('fieldName')`. No batch save, no form-level validation."* i proponuje v2 na `CrudForm` z koegzystencją: *"v2 pages coexist with v1 — menus/links updated to v2, API unchanged"* [evidence].
- **WERDYKT: deliberate constraint, częściowo zrealizowany** — wzorzec inline-edit był wczesną (przed-CrudForm-dojrzałością) decyzją, explicite zidentyfikowaną jako problem i zaadresowaną przez SPEC-046 dla GŁÓWNEGO formularza. Resztkowy wzorzec (3x header dla akcji poza CrudForm na v2) jest TYM SAMYM debt w mniejszej skali, jawnie przewidzianym do dalszej konsolidacji w komentarzu `optimisticLock.ts`.

**Wykonalność migracji:**

- `TC-LOCK-OSS-002` i siostrzane specy (001/004/005/009/014-018) są API-level (Playwright `fetch`-style na `/api/customers/people` z headerem locka), **nie** sterują UI / nie wołają `useGuardedMutation` [evidence]. Żaden test nie obejmuje hooka na poziomie strony — ekstrakcja wymagałaby NOWEGO testu jednostkowego.
- **Pierwszy krok-prerekwizyt**: napisać test charakteryzujący (characterization test) dla obecnych 2 call-site'ów `people-v2/[id]/page.tsx` (raport: "3 call-site'ów"; header-building + odświeżenie `updatedAt`), następnie wyekstrahować je do JEDNEGO page-local hooka (np. `usePersonGuardedMutation`) — **lokalnie dla tej strony**, NIE jako nowy shared hook w `@open-mercato/ui` (110 plików używa wzorca; przedwczesne uogólnianie z jednej strony).

---

### C6 — Cykl komponentów `PersonCard ↔ CompanyPeopleSection`

**Obecny kształt:**

- `PersonCard.tsx:13` — `import type { CompanyPersonSummary } from './CompanyPeopleSection'` [evidence]. `CompanyPeopleSection.tsx:19` — `import { PersonCard } from './PersonCard'`, użycie na linii 738 [evidence].
- `CompanyPersonSummary` zdefiniowany w `CompanyPeopleSection.tsx` (linie ~31-45, alias typu z polami id/displayName/email/phone/status/lifecycleStage itd.) [evidence]. `PersonCard` przyjmuje `person: CompanyPersonSummary` (linia ~55) [evidence].
- **Cykl jest TYPE + VALUE**: TYPE — `PersonCard → CompanyPersonSummary` (z `CompanyPeopleSection`); VALUE — `CompanyPeopleSection → PersonCard` (komponent, jednokierunkowo — `PersonCard` NIE importuje `CompanyPeopleSection` jako wartości) [evidence].
- **Dodatkowe znalezisko**: strukturalnie niemal identyczny typ o TEJ SAMEJ nazwie `CompanyPersonSummary` jest NIEZALEŻNIE zdefiniowany w `customers/components/formConfig.tsx:1896-1908` (raport: "1896-1909"; 1908 jest linią zamykającą `}`, 1909 to linia pusta), używany przez `companies/[id]/page.tsx:44,92` i `companies-v2/[id]/page.tsx:27` (który importuje wersję z `CompanyPeopleSection.tsx`) — **CONFIRMED**: różnią się tylko kolejnością pól `source`/`temperature` (`CompanyPeopleSection.tsx` ma `temperature` przed `source`, `formConfig.tsx` ma `source` przed `temperature`), prawdopodobnie przypadkowa duplikacja [evidence].
- `CompanyPeopleSection.test.tsx` referencuje `CompanyPersonSummary` 7x: import z `../CompanyPeopleSection` na linii 7, oraz 6 użyć typu na liniach 44, 74, 253, 381, 412, 453 (raport mówił "importuje ... na liniach 7,44,74,253,381,412,453" — tylko linia 7 jest importem, pozostałe to type annotations) [evidence — `grep -n "CompanyPersonSummary"`].

**Historia i intencjonalność:**

- `CompanyPeopleSection.tsx` powstał w `027d73128` ("fix: filtering fix", 2025-10-24) — istniał PRZED cyklem [evidence]. `PersonCard.tsx` powstał w `d8504879e` ("crm details screens init", Maciej Dudziak, 2026-04-09) jako nowy plik 174 linii, w TYM SAMYM commicie, który zmodyfikował `CompanyPeopleSection.tsx` (+276 linii), rozszerzając już istniejący `CompanyPersonSummary` [evidence]. Obie krawędzie cyklu wprowadzone atomowo w `d8504879e` [evidence].
- **WERDYKT: accidental complexity** — cykl powstał w jednym dużym commicie "crm details screens init", gdzie nowy komponent karty (`PersonCard`) został dodany i podłączony do reużycia typu z komponentu sekcji, który go renderuje, bez ekstrakcji `CompanyPersonSummary` do współdzielonego modułu typów (katalog `detail/` ma już `types.ts` per listing z post-flow-analysis). Brak commitu/spec dyskutującego to jako świadomą decyzję.

**Wykonalność migracji:**

- Przeniesienie `CompanyPersonSummary` z `CompanyPeopleSection.tsx` do współdzielonego `detail/types.ts` (z re-eksportem dla `CompanyPeopleSection.test.tsx`, import typu — zero zmian w teście) jest mechaniczne, ~3 pliki dotknięte [evidence].
- **Nie rozwiązuje całego cyklu**: usuwa krawędź TYPE, ale krawędź VALUE (`CompanyPeopleSection → PersonCard`, linia 19/738) zostaje — `no-circular` dla tej pary nadal by się zgłaszał [evidence].
- Brak dedykowanego `PersonCard.test.tsx`; istniejący `CompanyPeopleSection.test.tsx` przetrwałby ekstrakcję typu (re-eksport) [evidence].
- **Pierwszy krok-prerekwizyt**: przeniesienie `CompanyPersonSummary` do `detail/types.ts` + re-eksport z `CompanyPeopleSection.tsx` — mechaniczne, odwracalne, ~3 pliki. Duplikat w `formConfig.tsx:1896-1909` to ODDZIELNA sprawa, do zaflagowania, nie do zlewania w tym samym kroku.

## Refactor opportunities (ranked)

### 1. C1 — Cross-module ORM entity imports (sales↔customers, customers↔auth)

- **Obecny → docelowy kształt**: statyczne importy `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress` w `sales` (2 pliki) i `User` z `auth` w `customers/api/*` (7 plików) → opublikowany, wersjonowany kontrakt read-model/DTO (wzorem hydratora z `interactionReadModel.ts`, uogólnionego), konsumowany przez `sales`/`customer_accounts` i `customers/api/*` zamiast surowych typów encji z modułów obcych. (Nazwany kształt, nie zaprojektowany w detalu.)
- **Czemu na tym miejscu**: jedyny kandydat mapujący się 1:1 na explicite, długo dokumentowaną zasadę AGENTS.md ("NO direct ORM relationships between modules") ORAZ na ryzyko najwyższej pewności — zmiana pola na `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress` łamie kompilację `sales` bez ostrzeżenia kontraktowego. Koszt długu: każda zmiana modelu `customers` wymaga ręcznego audytu `sales`/`customer_accounts`/`auth`. Koszt pierwszego kroku: niski (1 DTO + 1 call site).
- **Blast radius**: `sales` — 2 pliki statycznie (`documents.ts`, `seed/examples.ts`; `inbox-actions.ts` ODRZUCONY po weryfikacji — dynamiczne `resolveEntityClass`, nie import); `customers/api/*` — 7 plików (`User`); `customer_accounts` — 3 pliki/6 wywołań (już zgodne, dynamic import). `depcruise` nie w CI; podniesienie reguły do `error` złamałoby build repo-wide (216 ostrzeżeń łącznie, ta reguła dotyczy wielu par modułów poza tym trio) — pełna migracja to wiele PR-ów, nie flip flaga.
- **Szkic ścieżki**: (1) DTO + loader dla `customers→auth` (np. `CustomerUserSummary`), migracja JEDNEGO z 7 plików `customers/api/*`; (2) powtórzyć dla pozostałych 6; (3) równolegle/później: DTO snapshot dla `sales`-side (`documents.ts`/`seed/examples.ts`) — wyższe ryzyko/wartość, osobny tor; (4) po obu kierunkach z działającymi precedensami, rewizja severity reguły depcruise (wymaga wcześniejszego repo-wide cleanupu).
- **Pierwszy krok-prerekwizyt**: DTO + loader dla kierunku `customers→auth` (tylko odczyt pól wyświetlanych `User`), podmiana JEDNEGO z 7 call site'ów (np. `activities/route.ts`) — bez usuwania importu w pozostałych, w pełni odwracalne, ~1 plik diff + 1 nowy helper.

### 2. C4 — Hand-rolled detail `GET /api/customers/people/[id]` (1203 linii)

- **Obecny → docelowy kształt**: monolityczny 1203-liniowy route agregujący 9+ powiązanych encji bez testu jednostkowego głównego handlera → zestaw nazwanych, niezależnie testowalnych helperów agregacji (jeden per sekcja: custom fields, tags/comments, activities/interactions, deals/companies/todos), komponowanych przez ten sam route, z identycznym kształtem odpowiedzi. (Nazwany kształt — NIE migracja do pipeline `makeCrudRoute`, bo `factory.ts` nie ma żadnego extension pointu dla detail-GET; to pytanie dla osobnej analizy.)
- **Czemu na tym miejscu**: największy pojedynczy hand-rolled agregat w repo (1203 linii), ZERO testu jednostkowego na głównym handlerze mimo bycia stroną detali modułu #1 wg aktywności, a jednocześnie plik JUŻ zawiera zarodki własnej dekompozycji (helpery typu `resolveTodoDetails`, `normalizeCustomerDetailCustomFields` z sąsiedniego pliku) — pierwszy krok jest praktycznie bezryzykowny i daje szablon.
- **Blast radius**: 1 plik (1203 linii), konsumowany przez `people-v2/[id]/page.tsx` (potwierdzone LIVE). Brak potwierdzonego innego `[id]/route.ts` porównywalnej wielkości. Zmiana wewnętrznej struktury bez zmiany kształtu odpowiedzi ma blast radius bliski zeru.
- **Szkic ścieżki**: (1) ekstrakcja blocku custom fields (load → merge → normalize, już używa helperów z sąsiedniego pliku) do jednej funkcji o identycznym I/O, z testem kontraktowym/snapshotowym; (2) powtórzyć dla tags/comments, potem activities/interactions, potem deals/companies/todos — każda jako osobny PR z własnym testem; (3) po dekompozycji ocenić, czy któryś helper jest reużywalny przez INNE route'y detail (np. `companies/[id]`) — to pytanie staje się odpowiadalne dopiero z dowodami z (1)-(2).
- **Pierwszy krok-prerekwizyt**: ekstrakcja blocku custom fields do helpera + test kontraktowy asercjonujący identyczność odpowiedzi GET przed/po — najmniejszy, już-wybrukowany, odwracalny krok.

### 3. C5 — Person edit: konsolidacja resztkowego wzorca `useGuardedMutation` na `people-v2`

- **Obecny → docelowy kształt**: 3 powtórzone call site'y `withScopedApiRequestHeaders(buildOptimisticLockHeader(...), () => apiCallOrThrow(...))` + ręczne odświeżenie `updatedAt` na `people-v2/[id]/page.tsx` → jeden page-local hook (np. `usePersonGuardedMutation`) używany przez te 3 miejsca. (Nazwany kształt — explicite NIE shared hook w `@open-mercato/ui` na tym etapie.)
- **Czemu na tym miejscu**: najmniejszy blast radius z 6 kandydatów (1 plik, 3 call site'y), a komentarz dokumentacyjny w `packages/ui/src/backend/utils/optimisticLock.ts` JUŻ nazywa to jako oczekiwany następny krok ("a future PR may pull them into CrudForm directly once the reference rollout is broader"). Niski koszt, realna (choć skromna) wartość — usuwa 3x powtórzenie i daje szablon do ewentualnego późniejszego uogólnienia.
- **Blast radius**: 1 plik (`people-v2/[id]/page.tsx`). Brak zmian w pakiecie współdzielonym. Wymaga NOWEGO testu jednostkowego dla hooka (żaden istniejący test nie sięga tego poziomu — `TC-LOCK-OSS-*` są API-level).
- **Szkic ścieżki**: (1) test charakteryzujący obecne 3 call site'y (header-building + odświeżenie `updatedAt`); (2) ekstrakcja do jednego page-local hooka; (3) (osobno, później) jeśli 2-3 INNE strony zbiegną się do tego samego kształtu hooka, rozważyć promocję do `@open-mercato/ui`.
- **Pierwszy krok-prerekwizyt**: napisanie testu charakteryzującego (przed jakąkolwiek zmianą kodu) dla obecnego zachowania 3 call site'ów na `people-v2/[id]/page.tsx`.

## Considered but not ranked

- **C2 — Kernel SCC**: realny, ale doprecyzowanie zmniejszyło jego wagę względem framingu repo-map — cykl skoncentrowany w 2-3 plikach (nie 5-wierzchołkowy), 44+36 importerów w `customers` (raport: 43+35) to liście poza cyklem, dobre pokrycie testami `optimistic-lock*`/`cache`. Werdykt historii: `unknown`. Pierwszy "krok" zidentyfikowany w feasibility jest sam w sobie krokiem WERYFIKACYJNYM (czy `optimistic-lock-store.ts` ma już zero importów zwrotnych do `factory.ts`/`di/container.ts`), nie akcją — wymaga kolejnej rundy researchu przed planowaniem. Warto wrócić po C1 (DTO dotyka pośrednio `di/container`).
- **C3 — Hand-wired optimistic-lock readery / load order**: potwierdzony jako DELIBERATE (`.ai/specs/2026-05-28-optimistic-locking-coverage-completion.md` §3.5.1), zamierzony mechanizm dla encji polimorficznych, powtórzony w 3 modułach (`customers`, `sales`, `workflows`). Dług to nie wzorzec (load-bearing), ale nieprzetestowane niejawne założenie porządku. Dobrze wyskalowana naprawa to TEST regresyjny, nie zmiana struktury — bliżej luki w testach (N2/N4/N5) niż refaktoru. Rekomendacja: dopisać do backlogu testowego, nie do planu refaktoru.
- **C6 — Cykl `PersonCard ↔ CompanyPeopleSection`**: realny (TYPE+VALUE), mechaniczny pierwszy krok istnieje (ekstrakcja `CompanyPersonSummary` do `detail/types.ts`, ~3 pliki, test przetrwa przez re-eksport), ALE wg analizy obecnego kształtu to w praktyce "false positive" pod względem szkodliwości (cykl type-only + jednokierunkowy value, brak problemu w TS/bundlerze). Niski koszt długu mimo flagowania przez depcruise; ekstrakcja typu i tak NIE rozwiązuje całego cyklu (krawędź VALUE zostaje). Dobry kandydat na "boy scout rule" przy najbliższej zmianie w tych plikach, nie samodzielna zmiana. Dodatkowo: zaflagowany duplikat `CompanyPersonSummary` w `formConfig.tsx:1896-1909` — odrębna sprawa.

## Non-candidates (input to feasibility/cost — not ranked)

- **N1** (di.ts dead code #2072) — trywialny cleanup; może być wykonany jako część PR dla C2/C3 (ten sam plik), ale nie jest samodzielnym refaktorem.
- **N2** (brak testu cross-tenant isolation dla `people`) — luka testowa, priorytet HIGH wg post-flow-analysis, ale nie zmienia struktury kodu.
- **N3** (custom fields undo broken, #2498) — znany, śledzony bug.
- **N4** (~10 nieprzetestowanych branchy filtrów listy) — luka testowa.
- **N5** (cascading nativeDelete bez asercji) — luka testowa.
- **N6** (legacy `.snapshot-openmercato.json`) — cleanup zbłąkanego pliku.

## Code References

- `packages/core/src/modules/sales/commands/documents.ts:64-68,662,670,722` — importy + odczyty `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress`
- `packages/core/src/modules/sales/seed/examples.ts:33-37,890-1055` — import + użycie seed
- `packages/core/src/modules/inbox_ops/lib/executionHelpers.ts:367-421` — `resolveCustomerEntityIdByEmail`/`resolveEntityClass(ctx, 'CustomerEntity')` (dynamic, NIE static import — odrzucone jako blast radius dla C1)
- `packages/core/src/modules/customers/lib/interactionReadModel.ts:8` — hydration helper importujący `User`, wzorzec do uogólnienia
- `.dependency-cruiser.cjs:5-7,40-42` — `no-circular`/`core-no-cross-module-entity-imports`, oba `warn`, plik untracked
- `packages/shared/src/lib/crud/factory.ts:3,44,952-963` — importy kernela + `createGenericOptimisticLockReader`/`registerOptimisticLockReaderIfAbsent`
- `packages/shared/src/lib/di/container.ts:7,9-10` — importy `CommandBus`/`createOptimisticLockGuardService`/`getAllOptimisticLockReaders`
- `packages/shared/src/lib/auth/server.ts:2` — brak importów z kernela CRUD
- `packages/shared/src/lib/crud/optimistic-lock-store.ts:45-50,61-75` — `registerOptimisticLockReaders`/`registerOptimisticLockReaderIfAbsent`
- `packages/core/src/modules/customers/di.ts:61-65` — hand-wired readery
- `packages/core/src/modules/sales/di.ts:67`, `packages/core/src/modules/workflows/di.ts:27` — analogiczne wywołania `registerOptimisticLockReaders`
- `.ai/specs/2026-05-28-optimistic-locking-coverage-completion.md` §3.5.1, linia ~403 — spec dla C3
- `packages/core/src/modules/customers/api/people/[id]/route.ts` (1203 linii) — C4
- `packages/core/src/modules/customers/backend/customers/people/[id]/page.tsx:53,175,318-349,398-411,447-461,187-195,850,875,900` — v1 (C5, debt #6 oryginalny)
- `packages/core/src/modules/customers/backend/customers/people-v2/[id]/page.tsx:8,26,103,365,398` — v2 (C5, LIVE, 2x `buildOptimisticLockHeader(` call sites — raport: 3x)
- `packages/core/src/modules/customers/backend/customers/people/page.tsx:630,918,937,942` — linkowanie do `people-v2`
- `.ai/specs/implemented/SPEC-046-2026-02-25-customer-detail-pages-v2.md:16,18,516,626` — v1/v2 koegzystencja
- `packages/ui/src/backend/utils/optimisticLock.ts` — komentarz o przyszłej konsolidacji do `CrudForm`
- `packages/core/src/modules/customers/components/detail/PersonCard.tsx:13,55` ↔ `CompanyPeopleSection.tsx:19,31-45,738` — cykl C6
- `packages/core/src/modules/customers/components/formConfig.tsx:1896-1908` — duplikat `CompanyPersonSummary` (odrębne znalezisko; raport: 1896-1909)

## Architecture Insights

- **Wzorzec "hand-wired wins via IfAbsent"** (`registerOptimisticLockReaders`/`registerOptimisticLockReaderIfAbsent`) jest świadomym, dokumentowanym extension pointem dla encji polimorficznych i powtarza się w 3 modułach (`customers`, `sales`, `workflows`) — dobry kandydat na wspólny test regresyjny zamiast osobnych poprawek per moduł.
- **`yarn depcruise` nie jest częścią CI** — wszystkie ostrzeżenia depcruise (216 repo-wide, w tym `no-circular`=78 i `core-no-cross-module-entity-imports` w wielu parach modułów) są czysto poradawcze. Każda dyskusja o "blast radius" oparta na severity tych reguł powinna pamiętać, że nic dziś nie blokuje ich narastania.
- **SPEC-046 ustanowił wzorzec "v1 remains, v2 is CrudForm-based, coexistence is intentional"** — przy ocenie debt items na stronach `customers`, sprawdź najpierw, czy istnieje `*-v2` odpowiednik, zanim potraktuje się v1 jako "live" kod.

## Historical Context (from prior changes)

- `context/changes/post-flow-analysis/research.md` — źródło 12 pozycji "Technical debt", z którego wyprowadzono 6 kandydatów (C1-C6) i 6 nie-kandydatów (N1-N6).
- `context/map/repo-map.md` strefy ryzyka #1 (Kernel SCC → C2), #2 (cross-module entity imports → C1), #6 (PersonCard/CompanyPeopleSection → C6) — wszystkie potwierdzone jako realne, ale C2 doprecyzowany jako węższy niż framing repo-map.

## Open Questions

- C2: czy `optimistic-lock-store.ts` ma faktycznie zero importów zwrotnych do `factory.ts`/`di/container.ts` (wymaga scoped depcruise run) — od tego zależy, czy "seam" już istnieje.
- C4: czy `companies/[id]/route.ts` (lub inny `[id]` route w `customers`/`sales`/`catalog`) ma porównywalny rozmiar/strukturę — nie zmierzone w tej sesji.
- C6: czy duplikat `CompanyPersonSummary` w `formConfig.tsx:1896-1908` powinien być osobnym, drobnym changem niezależnie od losu C6.
- C1: czy istnieje analogiczny "interactionReadModel"-owy wzorzec hydratora w innych parach modułów (`catalog↔sales`), który mógłby być drugim precedensem przed uogólnieniem.

## Weryfikacja twierdzeń (ast-grep)

Weryfikacja przeprowadzona na commicie `be1df535b3f51980a67070ead9683c84f8b3174c` (branch `feature/10x-dev-architect-exercise`, bez nowych commitów). Dla każdego twierdzenia strukturalnego, na którym stoi ranking (C1/C4/C5) oraz dla najmocniejszych twierdzeń wspierających "considered but not ranked" (C2/C3/C6), zbudowano wzorzec `ast-grep`/`grep`, uruchomiono go i sklasyfikowano wynik. Każdy wynik zerowy (brak trafień) potwierdzono klasycznym `grep`.

| # | Twierdzenie (z raportu) | Werdykt | Dowód (file:line) | Metoda |
|---|---|---|---|---|
| 1 | C1: "7 plików `customers/api/*` importuje `User` z `auth/data/entities`" | **doprecyzowane** — 7 plików łącznie w module `customers`, ale tylko **6 w `api/*`**; 7. plik jest `lib/interactionReadModel.ts:8` | `customers/api/{entity-roles-factory.ts:11, interactions/route.ts:18, companies/[id]/route.ts:24, deals/[id]/route.ts:17, activities/route.ts:20, people/[id]/route.ts:22}` + `customers/lib/interactionReadModel.ts:8` | `ast-grep -p 'import { $$$ITEMS } from $SRC' --lang ts packages/core/src/modules/customers` (filtr na `User`/`auth/data/entities`), potwierdzone `grep -rn "auth/data/entities" ... \| grep -i User` |
| 2 | C1: "`sales`: 2 pliki (`documents.ts`, `seed/examples.ts`) importują `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress` statycznie" | **potwierdzone** | `sales/commands/documents.ts:65-67`, `sales/seed/examples.ts:34-36` — dokładnie te 2 pliki, depcruise nie raportuje trzeciego | `node_modules/.bin/depcruise packages apps/mercato/src --config .dependency-cruiser.cjs --output-type err-long` → `grep` po `sales/.*→ .*customers/data/entities` zwraca dokładnie 2 linie |
| 3 | C1: "`customer_accounts`: 3 pliki / 6 wywołań `await import('@open-mercato/core/modules/customers/data/entities')`" | **potwierdzone** | `customer_accounts/lib/customerEntityOwnership.ts:24` (1), `subscribers/autoLinkCrmReverse.ts:25,36,55` (3), `subscribers/autoLinkCrm.ts:31,47` (2) = 6 wywołań w 3 plikach | `grep -rn "await import.*customers/data/entities" packages/core/src/modules/customer_accounts` |
| 4 | C1: "`.dependency-cruiser.cjs`: `no-circular`=`warn` (linia ~6), `core-no-cross-module-entity-imports`=`warn` (linia ~41)" | **potwierdzone** | `.dependency-cruiser.cjs:5-6` (`name: 'no-circular'` / `severity: 'warn'`), `:40-41` (`name: 'core-no-cross-module-entity-imports'` / `severity: 'warn'`) | `grep -n "name:\|severity:" .dependency-cruiser.cjs` |
| 5 | C1: "`yarn depcruise` repo-wide → 216 ostrzeżeń, 0 błędów; nie działa w CI" | **potwierdzone** | `x 216 dependency violations (0 errors, 216 warnings). 4537 modules, 14419 dependencies cruised.`; `grep -rl "depcruise\|dependency-cruiser" .github/workflows/*.yml` → brak wyników | `node_modules/.bin/depcruise packages apps/mercato/src --config .dependency-cruiser.cjs --output-type err-long`; `grep -rl` na `.github/workflows/*.yml` (exit 1, potwierdzono klasycznym grep — brak ast-grep potrzebny) |
| 6 | C2: "Repo-wide `no-circular` = 78 wystąpień (część z 216 ostrzeżeń łącznie)" | **potwierdzone** | 78 linii `warn no-circular:` w pełnym wyjściu depcruise (z 216 łącznie: 78 `no-circular` + 128 `core-no-cross-module-entity-imports` + 10 `shared-no-domain-deps`) | `grep -c "warn no-circular:" /tmp/depcruise-out.txt` → 78 |
| 7 | C2: "`factory.ts` importuje `createRequestContainer` z `di/container` (linia 3), typy z `commands` (linia 44), `createGenericOptimisticLockReader`/`registerOptimisticLockReaderIfAbsent` (~952-963)" | **potwierdzone** | `packages/shared/src/lib/crud/factory.ts:3` (`createRequestContainer`), `:44` (`CommandBus, CommandLogMetadata`), `:72` (import `createGenericOptimisticLockReader`), `:73` (import `registerOptimisticLockReaderIfAbsent`), `:952` (call `createGenericOptimisticLockReader`), `:963` (call `registerOptimisticLockReaderIfAbsent`) | `grep -n "beforeList\|afterList\|GET?:\|createGenericOptimisticLockReader\|registerOptimisticLockReaderIfAbsent" packages/shared/src/lib/crud/factory.ts`; `sed -n '1,5p;40,46p'` |
| 8 | C2: "`di/container.ts` importuje `CommandBus`/`createOptimisticLockGuardService`/`getAllOptimisticLockReaders` (linie 7, 9-10)" | **potwierdzone** | `packages/shared/src/lib/di/container.ts:7` (`commandRegistry, CommandBus`), `:9` (`createOptimisticLockGuardService`), `:10` (`getAllOptimisticLockReaders`) | `sed -n '1,15p' packages/shared/src/lib/di/container.ts` |
| 9 | C2: "`auth/server.ts` ma brak importów z kernela CRUD (linia 2)" | **potwierdzone** | `packages/shared/src/lib/auth/server.ts:1-4` — tylko `next/headers`, `@mikro-orm/postgresql` (type), `./jwt`, `./apiKeyAuthCache`; brak `crud`/`di`/`commands` | `sed -n '1,10p' packages/shared/src/lib/auth/server.ts` |
| 10 | C2: "`optimistic-lock.ts` jest samowystarczalny — importy tylko z `optimistic-lock-store`/`optimistic-lock-headers` (linie 33-46)" | **potwierdzone** | `packages/shared/src/lib/crud/optimistic-lock.ts:33` (`EntityManager` type), `:34,39` (lokalne typy), `:46` (`getAllOptimisticLockReaders` z `./optimistic-lock-store`) | `grep -n "^import" packages/shared/src/lib/crud/optimistic-lock.ts` |
| 11 | C2: "`customers`: 43 pliki importują `di/container`, 35 importują `auth/server`" | **doprecyzowane**: **44** (raport: 43) i **36** (raport: 35) | `grep -rl` zwraca 44 i 36 plików | `grep -rl "from '@open-mercato/shared/lib/di/container'" packages/core/src/modules/customers --include="*.ts" \| wc -l` → 44; analogicznie dla `auth/server` → 36 |
| 12 | C3: "`registerOptimisticLockReaders(` wywołane w 3 modułach: `customers/di.ts:61`, `sales/di.ts:67`, `workflows/di.ts:27`" | **potwierdzone** | `customers/di.ts:61-65`, `sales/di.ts:67-69`, `workflows/di.ts:27-35` — dokładnie te 3 wystąpienia, brak innych | `ast-grep run -p 'registerOptimisticLockReaders($$$ARGS)' --lang ts packages/core/src/modules \| grep di.ts` → 3 pliki |
| 13 | C3: "`optimistic-lock-store.ts`: `registerOptimisticLockReaders` (~45-50), `registerOptimisticLockReaderIfAbsent` (~61-75)" | **potwierdzone** | `packages/shared/src/lib/crud/optimistic-lock-store.ts:45` (`export function registerOptimisticLockReaders`), `:61` (`export function registerOptimisticLockReaderIfAbsent`), `:77` (`getAllOptimisticLockReaders`) | `grep -n "^export function\|^export const" packages/shared/src/lib/crud/optimistic-lock-store.ts` |
| 14 | C4: "`api/people/[id]/route.ts` = 1203 linii" | **potwierdzone** | `wc -l` → `1203 packages/core/src/modules/customers/api/people/[id]/route.ts` | `wc -l "packages/core/src/modules/customers/api/people/[id]/route.ts"` |
| 15 | C4: "`makeCrudRoute` `beforeList`/`afterList` (linie 133-134) dotyczą tylko LIST, `GET?: CrudMethodMetadata` (~152) to tylko metadata trasy — brak hooka detail-GET" | **potwierdzone** | `packages/shared/src/lib/crud/factory.ts:133` (`beforeList?`), `:134` (`afterList?`), `:152` (`GET?: CrudMethodMetadata`); wywołania `afterList?.()` (linie 1395+) wszystkie w ścieżkach LIST/export, brak analogicznego hooka dla single-resource GET | `grep -n "beforeList\|afterList\|GET?:" packages/shared/src/lib/crud/factory.ts` |
| 16 | C5 (v1): "`people/[id]/page.tsx` — `useGuardedMutation` import linia 53/init 175, 3x `buildOptimisticLockHeader` w `savePerson`/`handleDelete`/`handleCustomFieldsSubmit`, 3x `runGuardedMutation={runMutationWithContext}` (850/875/900)" | **potwierdzone** | `useGuardedMutation` linie 53 (import), 175 (init), 197 (`runMutationWithContext`); `buildOptimisticLockHeader(` na liniach **324** (`savePerson`, zaczyna się 318), **400** (`handleDelete`, zaczyna się 389), **449** (`handleCustomFieldsSubmit`, zaczyna się 426); `runGuardedMutation={runMutationWithContext}` na liniach 850, 875, 900 | `grep -n "useGuardedMutation\|buildOptimisticLockHeader\|runMutationWithContext\|CrudForm" "packages/core/src/modules/customers/backend/customers/people/[id]/page.tsx"`; `grep -n "const savePerson\|const handleDelete\|const handleCustomFieldsSubmit\|= React.useCallback"` |
| 17 | C5 (v2): "`people-v2/[id]/page.tsx` — `CrudForm` (linia 8), `useGuardedMutation` (linia 26/103), **3 wystąpienia `buildOptimisticLockHeader`** (~365, ~398, +1)" | **obalone/doprecyzowane** — `CrudForm`/`useGuardedMutation` linie potwierdzone, ale tylko **2 wywołania `buildOptimisticLockHeader(...)`** (linie 365, 398); "trzecie wystąpienie" było linią `import { buildOptimisticLockHeader }` (linia 15), nie call-site. **do decyzji na etapie planowania**: ranking C5 (rank 3, "1 plik, 3 call site'y") opiera się na liczbie 3 — rzeczywista liczba (2) NIE zmienia rangi (blast radius jest jeszcze mniejszy), ale treść sekcji "Refactor opportunities (ranked)" ("3 powtórzone call site'y") wymaga aktualizacji na etapie planowania. | `packages/core/src/modules/customers/backend/customers/people-v2/[id]/page.tsx:8` (`CrudForm`), `:15` (import `buildOptimisticLockHeader`), `:26` (import `useGuardedMutation`), `:103` (`runMutation` init), `:365` (call w `savePerson`), `:398` (call w `handleFormDelete`) | `grep -n "CrudForm\|useGuardedMutation\|buildOptimisticLockHeader\|runMutation"` → wstępnie 3 trafienia dla `buildOptimisticLockHeader` (bez `(`); `grep -n "buildOptimisticLockHeader("` (z nawiasem) → 2 trafienia |
| 18 | C5: "lista `people/page.tsx` linkuje do `people-v2` na liniach 630, 918, 937, 942" | **potwierdzone** | `packages/core/src/modules/customers/backend/customers/people/page.tsx:630` (`<Link href=.../people-v2/${row.original.id}`), `:918,937,942` (`router.push`/`window.open` do `people-v2/${row.id}`) | `grep -n "people-v2" "packages/core/src/modules/customers/backend/customers/people/page.tsx"` |
| 19 | C5: "`buildOptimisticLockHeader` importowany w ~100 plikach repo-wide" | **doprecyzowane** — **110 plików** (raport: ~100) | `grep -rl` zwraca 110 plików w `packages`+`apps/mercato/src` | `grep -rl "buildOptimisticLockHeader" packages apps/mercato/src --include="*.ts" --include="*.tsx" \| wc -l` → 110 |
| 20 | C6: "`PersonCard.tsx:13` `import type { CompanyPersonSummary } from './CompanyPeopleSection'`, `:55` `person: CompanyPersonSummary`; `CompanyPeopleSection.tsx:19` `import { PersonCard }`, `:738` użycie `<PersonCard`, typ `CompanyPersonSummary` zdefiniowany ~31-45" | **potwierdzone** | `PersonCard.tsx:13,55`; `CompanyPeopleSection.tsx:19,738`, typ na liniach 31-45 (zamykający `}` na 45) | `grep -n "CompanyPeopleSection\|CompanyPersonSummary\|^import\|^type\|^export type\|person:" packages/core/src/modules/customers/components/detail/PersonCard.tsx`; `grep -n "PersonCard\|CompanyPersonSummary\|^export type"  .../CompanyPeopleSection.tsx`; `sed -n '31,46p'` |
| 21 | C6: "duplikat `CompanyPersonSummary` w `formConfig.tsx:1896-1909`, różni się tylko kolejnością pola `source`" | **doprecyzowane** — typ rozciąga się na liniach **1896-1908** (raport: 1896-1909; 1909 to linia pusta); różnica pól potwierdzona: `CompanyPeopleSection.tsx` ma `temperature` PRZED `source`, `formConfig.tsx` ma `source` PRZED `temperature` — pola identyczne, kolejność zamieniona | `packages/core/src/modules/customers/components/formConfig.tsx:1896-1908` | `grep -n "CompanyPersonSummary" packages/core/src/modules/customers/components/formConfig.tsx`; `sed -n '1890,1912p'` porównane z `sed -n '31,46p'` CompanyPeopleSection.tsx |
| 22 | C6: "`CompanyPeopleSection.test.tsx` importuje `CompanyPersonSummary` na liniach 7,44,74,253,381,412,453" | **doprecyzowane** — 7 wystąpień potwierdzonych na tych samych liniach, ale tylko linia 7 jest importem (`import { CompanyPeopleSection, type CompanyPersonSummary } from '../CompanyPeopleSection'`); 44,74,253,381,412,453 to type annotations w testach | `packages/core/src/modules/customers/components/detail/__tests__/CompanyPeopleSection.test.tsx:7,44,74,253,381,412,453` | `grep -n "CompanyPersonSummary" .../__tests__/CompanyPeopleSection.test.tsx` |
| 23 | C1: "`customers/lib/interactionReadModel.ts` to jedyny `*ReadModel`-owy plik, sam importuje `User` (linia 8), brak innego eksportu cross-module read-model" | **potwierdzone** | Plik istnieje, eksportuje `hydrateCanonicalInteractions`/`loadCustomerSummaries`, konsumowane WYŁĄCZNIE wewnątrz `customers` (`api/companies/[id]/route.ts:39`, `api/activities/route.ts:30`, `api/people/[id]/route.ts:34`, `lib/todoCompatibility.ts:15`) — brak eksportu poza moduł | `find packages/core/src/modules/customers -iname "*ReadModel*"`; `grep -rn "interactionReadModel" packages/core/src/modules/customers` |

### Podsumowanie weryfikacji

- **20/23 twierdzeń potwierdzonych dokładnie**, **3 doprecyzowane/obalone** w istotny sposób:
  - #1/#2 z tej tabeli (C1, 7 vs 6+1 plików `User`) — nie zmienia rankingu C1 (rank 1), tylko lokalizację 7. pliku.
  - #11 (C2, 43+35 → 44+36) — nie zmienia statusu "considered but not ranked" dla C2.
  - **#17 (C5, 3 → 2 call site'y `buildOptimisticLockHeader` w `people-v2`)** — **do decyzji na etapie planowania**: nie zmienia rangi C5 (rank 3, wciąż najmniejszy blast radius z 3 rankowanych kandydatów — nawet mniejszy niż wcześniej oceniono), ale treść "Obecny → docelowy kształt" i "Szkic ścieżki" w sekcji "Refactor opportunities (ranked)" (mówiące o "3 powtórzonych call site'ach") powinna być zrewidowana na "2" przy przejściu do planowania.
- Repo-wide `yarn depcruise` (216 ostrzeżeń, 0 błędów, `no-circular`=78, `core-no-cross-module-entity-imports`=128, `shared-no-domain-deps`=10) jest nowym, dokładnym punktem odniesienia — "216"/"78" były już w raporcie i zostały tu potwierdzone z rozbiciem na 3 reguły.
- Jedno twierdzenie dało wynik zerowy: #5 ("depcruise nie działa w CI") — `grep -rl "depcruise\|dependency-cruiser" .github/workflows/*.yml` zwrócił 0 wyników (exit 1); potwierdzone jako prawdziwe (brak referencji = brak integracji z CI), klasyczny `grep` był tu jedyną i wystarczającą metodą. Pozostałe 22 twierdzenia zwróciły trafienia zgodne (lub doprecyzowujące) z oryginałem.
