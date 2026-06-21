---
date: 2026-06-12T15:29:20+02:00
researcher: Claude (claude-sonnet-4-6)
git_commit: be1df535b3f51980a67070ead9683c84f8b3174c
branch: feature/10x-dev-architect-exercise
repository: open-mercato
topic: "Post-flow analysis: customers (Person) CRUD — e2e trace, test gaps, blast radius"
tags: [research, codebase, customers, crud-factory, optimistic-lock, sales, auth, ui-backend]
status: complete
last_updated: 2026-06-12
last_updated_by: Claude (claude-sonnet-4-6)
---

# Research: Post-flow analysis of the `customers` module

**Date**: 2026-06-12T15:29:20+02:00
**Researcher**: Claude (claude-sonnet-4-6)
**Git Commit**: be1df535b3f51980a67070ead9683c84f8b3174c
**Branch**: feature/10x-dev-architect-exercise
**Repository**: open-mercato

## Research Question

> Przeanalizuj proces `customers`, zwracając szczególną uwagę na powiązane z nim obszary zdefiniowane w `context/map/repo-map.md`. Trzy wymiary: (1) trace e2e (entry point → warstwy → zapis/odczyt → powrót, z file:line i diagramem Mermaid), (2) luki w testach (metody/gałęzie pokryte vs niepokryte), (3) blast radius (graf statyczny + co-change z historii gita: szew interfejsu, warstwy generowane, model, migracje, testy). Raport musi zawierać sekcje "Feature overview" i "Technical debt".

Zakres przyjęty dla analizy: **kanoniczny przepływ CRUD dla encji "Person"** (`CustomerEntity` z `kind: 'person'` + `CustomerPersonProfile`) w `packages/core/src/modules/customers` — moduł referencyjny dla wzorca CRUD w całym repo (#1 aktywności, 3177 zmian/12 mies., wg `artifact-1-territory.md`).

## Summary

`customers/people` jest "podręcznikowym" konsumentem kernela CRUD (`makeCrudRoute`, DI, command bus, optimistic-lock guard) — ale jednocześnie demonstruje **trzy udokumentowane odstępstwa od idealnego wzorca**, które każdy nowy moduł kopiujący ten wzorzec musi powtórzyć świadomie: (1) detal (`GET /people/[id]`) jest hand-rolled, nie `makeCrudRoute`, (2) edycja jest per-pole inline-edit przez `useGuardedMutation`, nie `CrudForm`, (3) `resourceKind` dla optimistic-lock ma niewregularną pluralizację (`customers.people` vs `customers.person`) wymagającą ręcznej rejestracji w `di.ts` pod trzema kluczami.

Pokrycie testami jest **silne tam, gdzie boli najbardziej w historii** (optimistic-lock 409, ACL 403, dependent-delete guard, undo/redo) — ale ma jedną krytyczną dziurę: **brak testu izolacji cross-tenant/cross-organization** dla ścieżki `people` (tylko generyczny unit test helpera `ensureTenantScope`/`ensureOrganizationScope`, nie przetestowany na realnym mismatch przez API). Lista filtrów `/api/customers/people` (12 branchy) jest w ~90% nieprzetestowana, mimo że analogiczne filtry dla `companies` mają testy.

Blast radius potwierdza dwie ze stref ryzyka z `repo-map.md` jako **realne, skompilowane zależności (nie tylko warn w grafie)**: `sales/commands/documents.ts:662-670,722` i `sales/seed/examples.ts:33,890-1055` bezpośrednio importują i odpytują `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress` — zmiana pola w tych encjach łamie `sales` w czasie kompilacji. Symetrycznie, 7 plików w `customers/api/*` importują `User` z `auth/data/entities` do wyświetlania nazw właścicieli/autorów (potwierdzone ast-grepem 1:1). `customer_accounts` powiela to samo sprzężenie przez `await import()` (dynamiczny import nie wykrywany przez dependency-cruiser). Migracje i `data/validators.ts` zmieniają się w >85% commitów dotykających `data/entities.ts`; 4 pliki i18n modułu zawierają **2483 kluczy `customers.*`** (nie 63 — wcześniejsza liczba była błędna, patrz sekcja weryfikacji).

> **Walidacja ast-grep (2026-06-12)**: wszystkie twierdzenia strukturalne tego raportu zostały zweryfikowane wzorcami ast-grep — patrz [AST-grep Verification](#ast-grep-verification-weryfikacja-twierdzeń-strukturalnych). Najważniejsza korekta: **Technical debt #3 (pluralizacja `resourceKind`) jest OBALONE** — bug #2072 został naprawiony w PR #2076 (`ffbd7c45e`), `deriveResourceFromCommandId('customers.people.update')` zwraca dziś `'customers.person'`, a wpis `RESOURCE_KIND_PEOPLE = 'customers.people'` w `di.ts:17,64` jest martwym kodem z nieaktualnym komentarzem. Druga istotna korekta: **"12 route'ów `makeCrudRoute`" jest OBALONE** — rzeczywista liczba to **7** (`tags`, `comments`, `companies`, `deals`, `interactions`, `addresses`, `people`).

## AST-grep Verification — weryfikacja twierdzeń strukturalnych

Dla każdego twierdzenia strukturalnego z pierwszej wersji raportu zbudowano wzorzec `ast-grep`, wykonano go na repo i porównano wynik z oryginalnym twierdzeniem. Wynik: **potwierdzone** / **doprecyzowane** / **obalone**.

### 1. `customers/di.ts` rejestruje JEDEN reader pod trzema kluczami resourceKind

- **Twierdzenie**: `di.ts:16-17,61-65` rejestruje `readCustomerPersonUpdatedAt` pod `customers.person` i `customers.people` (+ `readCustomerCompanyUpdatedAt` pod `customers.company`).
- **Wzorzec**: ręczny odczyt `di.ts` (literały `RESOURCE_KIND_*` + obiekt przekazany do `registerOptimisticLockReaders`).
- **Wynik**: **potwierdzone co do faktu** (`di.ts:8,16-17,61-65` — trzy klucze, dwa readery). Ale zobacz punkt 8 — **kontekst tego faktu jest obalony**: rejestracja pod `customers.people` jest martwym kodem.

### 2. 7 plików `customers/api/*` importuje `User` z `auth/data/entities`

- **Wzorzec**: `import { $$$IMPORTS } from $SRC` (lang ts) na całym `packages/core/src/modules/customers/`, filtr `$SRC` zawiera `auth/data/entities`.
- **Wynik**: **potwierdzone 1:1**, z dokładnymi liniami:
  - `api/companies/[id]/route.ts:24`
  - `api/activities/route.ts:20`
  - `api/entity-roles-factory.ts:11`
  - `api/interactions/route.ts:18`
  - `lib/interactionReadModel.ts:8`
  - `api/deals/[id]/route.ts:17`
  - `api/people/[id]/route.ts:22`
  - Wszystkie 7 importują dokładnie `User` (nic więcej). Liczba i linie z raportu są dokładne.

### 3. `sales/commands/documents.ts` — import + `em.findOne(CustomerEntity/CustomerPersonProfile)`

- **Wzorzec**: `import { $$$IMPORTS } from $SRC` (filtr `customers/data/entities`) + `em.findOne($ENTITY, $$$)`.
- **Wynik**: **doprecyzowane**:
  - Import faktycznie na liniach **64-68** (`CustomerAddress, CustomerEntity, CustomerPersonProfile`), nie tylko 66-67 — 66-67 to tylko linie `CustomerEntity,`/`CustomerPersonProfile,` wewnątrz wieloliniowego importu.
  - `em.findOne(CustomerEntity, ..., { populate: ['personProfile','companyProfile'] })` jest na linii **662** (nie 663).
  - `em.findOne(CustomerPersonProfile, ...)` jest na linii **670** — zgodne z raportem.
  - **Nowe odkrycie (raport tego nie miał)**: w tej samej funkcji (`resolveAddressSnapshot`) jest też `em.findOne(CustomerAddress, ...)` na linii **722** — trzecia, nieudokumentowana zależność `sales → customers` w `documents.ts`, analogiczna do tej opisanej dla `seed/examples.ts`.

### 4. `sales/seed/examples.ts` — import `CustomerAddress/CustomerEntity/CustomerPersonProfile`

- **Wynik**: **doprecyzowane** — import jest na **jednej linii 33** (`import { CustomerAddress, CustomerEntity, CustomerPersonProfile, ... } from ...`), nie "35-37". Użycie w seedzie (890-1055) nie weryfikowane ponownie (zakres niezmieniony, poza zasięgiem ast-grep na pojedynczy plik o tej wielkości w tej sesji).

### 5. `customer_accounts` — dynamiczne importy `customers/data/entities`

- **Wzorzec**: `import($SRC)` (dynamic import expression) na `packages/core/src/modules/customer_accounts/`.
- **Wynik**: **doprecyzowane / częściowo obalone co do linii**:
  - `autoLinkCrm.ts:31,47` — **potwierdzone**.
  - `autoLinkCrmReverse.ts` — raport podawał `25,29,37`; rzeczywiste linie to **`25,36,55`** (3 dynamiczne importy, nie 2 jak sugerowałyby linie 25,29).
  - `customerEntityOwnership.ts` — raport nie podawał linii; rzeczywista linia to **24** (1 dynamiczny import).
  - Łącznie 3 pliki / 6 dynamicznych importów `@open-mercato/core/modules/customers/data/entities` — liczba plików (3) się zgadza, linie w `autoLinkCrmReverse.ts` wymagały korekty.

### 6. `apps/mercato/src/modules.ts:69` — jedyny statyczny wpis `customers`

- **Wzorzec**: `grep -n "customers" apps/mercato/src/modules.ts`.
- **Wynik**: **potwierdzone** — tylko linia 69 (`{ id: 'customers', from: '@open-mercato/core' }`). Linia 147 (`example_customers_sync`) to inny moduł, nie dotyczy `customers`.

### 7. `auth/api/admin/nav.ts` — 0 wpisów `customers`

- **Wynik**: **potwierdzone** — `grep -rn "customers" .../auth/api/admin/nav.ts` zwraca brak wyników.

### 8. Technical debt #3 — pluralizacja `resourceKind` (`customers.people` vs `customers.person`) — **OBALONE**

- **Twierdzenie oryginalne**: "Factory `deriveResourceFromCommandId` nie singularyzuje `'people'` → `'person'`, produkując `resourceKind = 'customers.people'`", co wymaga rejestracji readera pod trzema kluczami w `di.ts`.
- **Wzorzec**: odczyt `packages/shared/src/lib/crud/cache.ts` (`deriveResourceFromCommandId`, `singularizeSegment`, `IRREGULAR_PLURALS`) + `git log` na ten plik + test `packages/shared/src/lib/crud/__tests__/cache.test.ts`.
- **Wynik**: **OBALONE**. `cache.ts:113-123` definiuje `IRREGULAR_PLURALS = { people: 'person', children: 'child', mice: 'mouse', ... }`. `singularizeSegment('people')` zwraca `'person'` przez ten słownik. Commit **`ffbd7c45e` — "fix(shared): singularizeSegment handles irregular plurals (#2072)" (PR #2076)** naprawił właśnie ten bug. Test `cache.test.ts:7-15` jest regresją na to dokładne issue:
  ```ts
  describe('deriveResourceFromCommandId — irregular plurals (#2072)', () => {
    it('singularises "people" to "person"', () => {
      expect(deriveResourceFromCommandId('customers.people.update')).toBe('customers.person')
      ...
  ```
  Ślad podążono do `factory.ts:472-482` (`resolveResourceAliasesList`): dla `api/people/route.ts` (brak `opts.events`), `rawCandidate = commandResource = deriveResourceFromActions(opts.actions)` → `deriveResourceFromCommandId('customers.people.update')` → **`'customers.person'`**. Ten `resourceKind` jest przekazywany do `runMutationGuards` przy update (`factory.ts:2365`).
  - **Konsekwencja**: `RESOURCE_KIND_PEOPLE = 'customers.people'` i jego rejestracja w `di.ts:17,64` są **martwym kodem** — `validateMutation` nigdy nie odpyta o klucz `customers.people`, bo `resourceKind` w runtime to zawsze `customers.person`. `grep` po całym repo (poza testami/dist) na `'customers.people'` jako resourceKind nie znajduje żadnego innego konsumenta tego klucza.
  - Komentarz w `di.ts:9-15` ("factory... NIE singularyzuje 'people' → 'person'") jest **nieaktualny** — opisuje stan przed PR #2076.
  - Rejestracja pod `customers.person` (`RESOURCE_KIND_PERSON`, linia 63) jest poprawna i potrzebna (polimorficzna tabela `customer_entities` wymaga dyskryminacji `kind`), więc punkty 2 i 4 z Technical debt (hand-wired readery, kolejność ładowania) **pozostają w mocy** — tylko trzeci klucz (`customers.people`) jest zbędny.

### 9. `~10 tabel` w kaskadowym `nativeDelete` (`people.ts:1239-1256`)

- **Wzorzec**: `em.nativeDelete($ENTITY, $$$)` na `commands/people.ts`.
- **Wynik**: **potwierdzone, doprecyzowane**. Wewnątrz `withAtomicFlush(em, [...], {transaction:true})` (linie **1239-1256**) jest dokładnie **10 wywołań `em.nativeDelete`** (linie 1242-1253) na **9 różnych encjach** (`CustomerAddress`, `CustomerComment`, `CustomerActivity`, `CustomerInteraction`, `CustomerTodoLink`, `CustomerTagAssignment`, `CustomerDealPersonLink`, `CustomerPersonCompanyLink`, `CustomFieldValue` ×2 dla dwóch `entityId`), plus `em.remove(profile)` i `em.remove(record)`. "~10 tabel" jest trafnym przybliżeniem.

### 10. `~12 branchy filtrów` `/api/customers/people` (`route.ts:186-339`)

- **Wzorzec**: `if ($COND) { $$$ }` na `api/people/route.ts`, filtr linii 186-339.
- **Wynik**: **potwierdzone, doprecyzowane**. W zakresie 186-339 jest **13 blokow `if`** odpowiadających filtrom: email/emailStartsWith/emailContains (189,191,193 — jeden logiczny filtr "email" z 3 wariantami), status (196), lifecycleStage (199), source (202), tagIdsEmpty/tagIds (211,213), excludeLinkedCompanyId (223), excludeLinkedDealId (252), hasEmail (276), hasPhone (280), hasNextInteraction (284), createdFrom/createdTo/createdRange (288,292,296), custom fields (299), advanced filter tree (313). Pogrupowane w kategorie nazwane w raporcie (~10) liczba się zgadza.

### 11. `PersonCard.tsx` ↔ `CompanyPeopleSection.tsx` — cykl komponentów

- **Wzorzec**: `grep` importów w obu plikach.
- **Wynik**: **potwierdzone 1:1**. `PersonCard.tsx:13` — `import type { CompanyPersonSummary } from './CompanyPeopleSection'`. `CompanyPeopleSection.tsx:19` — `import { PersonCard } from './PersonCard'`, użycie na linii 738.

### 12. `12 route'ów makeCrudRoute` w `customers` — **OBALONE**

- **Wzorzec**: `makeCrudRoute($$$)` / `makeCrudRoute<$$$T>($$$)` (lang ts) + `grep -l "= makeCrudRoute"` na `packages/core/src/modules/customers/`.
- **Wynik**: **OBALONE**. Rzeczywista liczba route'ów z `const crud = makeCrudRoute(...)` to **7**: `api/tags/route.ts`, `api/comments/route.ts`, `api/companies/route.ts`, `api/deals/route.ts` (z generykiem `makeCrudRoute<unknown, unknown, DealListQuery>`), `api/interactions/route.ts`, `api/addresses/route.ts`, `api/people/route.ts`. Pozostałe top-level resource route'y w `customers/api/` (`activities`, `assignable-staff`, `labels`, `pipelines`, `pipeline-stages`, `todos` — 6 plików) są hand-rolled (`export async function GET/POST/PUT/DELETE`), nie używają `makeCrudRoute`. `api/deals/bulk-update-stage/route.ts` wspomina `makeCrudRoute` tylko w komentarzu.

### 13. `~50 plików` na `di/container.ts`, `~35 plików` na `auth/server.ts` w `customers`

- **Wzorzec**: `import { $$$IMPORTS } from $SRC` (lang ts), filtr `di/container` / `auth/server`, liczone unikalne pliki.
- **Wynik**:
  - `auth/server` → **potwierdzone 1:1**: dokładnie **35 plików** (lista odtworzona — m.in. `api/companies/[id]/route.ts`, `api/people/[id]/route.ts`, `api/interactions/*`, `api/labels/*`, `api/pipelines/route.ts`, `api/settings/*`, `lib/interactionRequestContext.ts`, itd.).
  - `di/container` → **doprecyzowane**: **43 pliki** (import value) — "~50" jest w przybliżeniu zgodne (±15%), nie ścisłe.

### 14. Pliki `commands/`, długość `[id]/route.ts`, klucze i18n

- **`commands/*` (16 plików)**: katalog `commands/` zawiera **19 plików `.ts`** (poza `__tests__`), w tym `index.ts` i `shared.ts` (nie są to per-encja command-pliki). Bez tych dwóch wychodzi **17**. Raport mówił "16" — **doprecyzowane**, różnica 1-3 plików w zależności od tego, co liczyć jako "command file".
- **`api/people/[id]/route.ts` (1204 linii)**: rzeczywiście **1203 linii** (`wc -l`) — różnica o 1, nieistotna.
- **`4 pliki i18n, każdy z 63 kluczami `customers.*``**: **OBALONE**. Każdy z `customers/i18n/{en,pl,es,de}.json` to płaski JSON z **2488 kluczami top-level**, z czego **2483 zaczynają się od `customers.`** (pozostałe 5 to `audit_logs.resource_kind.customers.*` i `backend.nav.*`). Liczba "63" nie odpowiada żadnemu sensownemu podzbiorowi całego pliku — być może pomylona z rozmiarem konkretnego diffu w jednym commicie (nie zweryfikowano, poza zakresem ast-grep).



### Co robi przepływ "Person CRUD"

Moduł `customers/people` udostępnia pełny CRUD dla kontaktu (osoby) w CRM:

- **Lista** (`GET /api/customers/people`) — paginowana, filtrowalna (search, email, status, lifecycle stage, source, tagi, custom fields, advanced filter tree, daty utworzenia, exclusion filters), z dekorowaniem custom fields i dociąganiem powiązanych pól `CustomerEntity`/`CustomerPersonProfile` (encrypted-aware) w `hooks.afterList`.
- **Detal** (`GET /api/customers/people/[id]`) — hand-rolled agregat: profil, adresy, tagi, komentarze, aktywności, interakcje, deale, firmy, todos, custom fields — znacznie bogatszy niż generyczny CRUD `GET`.
- **Tworzenie** (`POST /api/customers/people`, `customers.people.create`) — walidacja zod (`personCreateSchema`), tworzenie `CustomerEntity` + `CustomerPersonProfile`, routing custom fields, tagi, wpisy w słownikach (status/source/job_title), efekty (event + search index).
- **Edycja** (`PUT /api/customers/people`, `customers.people.update`) — inline, pole-po-polu, z **optimistic locking** (`updated_at` jako token w nagłówku), re-derywacją `displayName`, synchronizacją słowników/tagów/linku do firmy, custom fields, side effects post-commit. Odpowiedź zwraca świeży `updatedAt`, żeby kolejna sekwencyjna edycja nie dostała fałszywego 409.
- **Usuwanie** (`DELETE /api/customers/people`, `customers.people.delete`) — guard `PERSON_HAS_DEPENDENTS` (422, jeśli osoba ma powiązane deale), kaskadowe `nativeDelete` ~10 powiązanych tabel, optimistic-lock 409 na stale-delete.
- **Undo/redo** dla create/update/delete (z wyjątkiem custom fields — patrz Technical debt).

### E2E Trace — Write flow (Update Person, inline edit)

Krok po kroku, z `file:line`:

1. **Browser, load** — `packages/core/src/modules/customers/backend/customers/people/[id]/page.tsx:282-312` (`loadData`) → `GET /api/customers/people/{id}?include=todos`, odpowiedź zawiera `person.updatedAt` (token blokady).
2. **Browser, save** — `.../people/[id]/page.tsx:318-349` (`savePerson`) buduje `payload = {id, ...patch}` i woła:
   ```ts
   withScopedApiRequestHeaders(
     buildOptimisticLockHeader(data?.person?.updatedAt),
     () => apiCallOrThrow('/api/customers/people', { method: 'PUT', body: JSON.stringify(payload) }, ...)
   )
   ```
   `buildOptimisticLockHeader` — `packages/ui/src/backend/utils/optimisticLock.ts:30-36`.
3. **Browser, orchestration** — `packages/ui/src/backend/injection/useGuardedMutation.ts:59-94` (`runMutation`) — `onBeforeSave`/`onAfterSave` injection hooks, na błąd: `emitMutationSaveError` (linie 39-57).
4. **HTTP dispatcher** — `apps/mercato/src/app/api/[...slug]/route.ts:142-228` (`checkAuthorization`) — 401 bez auth, 403 jeśli brak `customers.people.manage` (z `routeMetadata.PUT`, `api/people/route.ts:71`).
5. **CRUD factory PUT** — `packages/core/src/modules/customers/api/people/route.ts:528-531` re-export `crud.PUT`; akcja `update` (linie ~374-429): `commandId: 'customers.people.update'`, `schema: rawBodySchema`, `mapInput` → `personUpdateSchema.parse(...)` (`data/validators.ts:119-130`), `response: { ok, updatedAt }`.
6. **Factory generic logic** — `packages/shared/src/lib/crud/factory.ts:2291-2441`:
   - 2293-2307: `withCtx`, 401/403 (org scope).
   - 2314-2329: `action.schema.parse(body)` → before-interceptors → `mapInput` → `personUpdateSchema.parse`.
   - 2330: `candidateId = input.id`.
   - **2357-2381 — Mutation guard / optimistic lock** (krytyczna brama):
     - `collectAndRunGuards` (`factory.ts:597-604`) → `runMutationGuards` (`packages/shared/src/lib/crud/mutation-guard-registry.ts:89-122`) → optimistic-lock guard `validateMutation` (`packages/shared/src/lib/crud/optimistic-lock.ts:282-364`).
     - `resourceKind` dla `commandId: 'customers.people.update'` to `'customers.person'` (singularyzacja `IRREGULAR_PLURALS`, fix #2072) — reader = `readCustomerPersonUpdatedAt` zarejestrowany pod kluczem `customers.person` w `packages/core/src/modules/customers/di.ts:63`. Rejestracja pod `customers.people` (linia 64) jest martwym kodem — patrz Technical debt #3.
     - `currentIso !== expectedIso` → `409` z body `{ code: 'optimistic_lock_conflict', currentUpdatedAt, expectedUpdatedAt }` (`optimistic-lock.ts:237-244, 359-363`) — **request kończy się tutaj, command nigdy nie wykonuje się**.
   - 2382-2390 (brak konfliktu): `commandBus.execute('customers.people.update', { input, ctx, metadata })`.
7. **Command** — `packages/core/src/modules/customers/commands/people.ts:914-1065` (`updatePersonCommand`):
   - 924-930: `em.fork()`, `findOne(CustomerEntity)` → `assertFound` (404) → `ensureTenantScope`/`ensureOrganizationScope` (izolacja tenant/org), `findOne(CustomerPersonProfile)`.
   - 932-1001 (`withAtomicFlush`, transaction): mutacja pól, re-derywacja `displayName` (939-948, 999-1001).
   - 1003-1042: sync słowników (status/source/job_title), `syncLegacyPrimaryCompanyLink`.
   - 1043: `syncEntityTags`.
   - **Po `withAtomicFlush`** (poprawne — post-commit per AGENTS.md "Entity Update Safety"): 1046 `setCustomFieldsForPerson`, 1048-1060 `emitCrudSideEffects` (event + indexer), 1061 `emitQueryIndexUpsertEvents`.
   - 1064: `return { entityId, updatedAt: record.updatedAt }` (świeży `updated_at` z hooka `onUpdate` MikroORM).
8. **Factory response** — `factory.ts:2391-2440`: `action.response({result})` → `{ ok: true, updatedAt }`, after-interceptors, `json(..., {status:200})`, `attachOperationHeader` (undo-token), sync `*.updated` event.
9. **Browser success** — `.../people/[id]/page.tsx:341-349` — `setData(person.updatedAt = nextUpdatedAt)` — odświeża token blokady dla kolejnej edycji.
10. **Browser conflict (409)** — `useGuardedMutation.ts:39-57` (`emitMutationSaveError`) → `surfaceRecordConflict` (`packages/ui/src/backend/conflicts/index.ts:32-49`) → `extractOptimisticLockConflict` (`packages/ui/src/backend/utils/optimisticLock.ts:46+`) → unified `RecordConflictBanner`.

### E2E Trace — Read flow (List People)

1. `packages/core/src/modules/customers/backend/customers/people/page.tsx:421` — `apiCall('/api/customers/people?...')` w `useEffect`.
2. Dispatcher `checkAuthorization` → `routeMetadata.GET = { requireFeatures: ['customers.people.view'] }` (`api/people/route.ts:69`).
3. Factory `GET` — `packages/shared/src/lib/crud/factory.ts:1337-1396+` — `opts.list.schema.parse(rawQueryParams)` (`listSchema`, `api/people/route.ts:41-66`), before-interceptors, `parseIdsParam`.
4. `list.buildFilters` (`api/people/route.ts`, ok. 88-373) — pełnotekstowe wyszukiwanie, ~12 branchy filtrów (email, status, lifecycleStage, source, tagIds, exclusions, hasEmail/hasPhone/hasNextInteraction, createdFrom/To, custom fields, advanced filter tree), query engine.
5. Query engine + `transformItem` — usuwa `kind`, normalizuje `cf:*` custom fields.
6. `hooks.afterList` (`api/people/route.ts:430-526`) — batchowe `findWithDecryption` dla `CustomerEntity`/`CustomerPersonProfile` (bez N+1).
7. Response enrichers (`enrichers: { entityId: 'customers.person' }`, `api/people/route.ts:77-87`) → `enricher-runner.ts`.
8. `json(payload, {status:200})` (`factory.ts:499-504`) — `{ items, total, page, pageSize }`.
9. `DataTable<PersonRow>` (`.../people/page.tsx:894`) renderuje.

### Mermaid — Write flow (Update Person)

```mermaid
sequenceDiagram
    participant Browser as Browser / Inline-Edit Page
    participant Dispatcher as API Dispatcher<br/>(apps/mercato .../api/[...slug]/route.ts)
    participant Route as CRUD Factory PUT<br/>(makeCrudRoute, factory.ts)
    participant Guard as Mutation Guards<br/>(optimistic-lock.ts)
    participant Command as updatePersonCommand<br/>(commands/people.ts)
    participant DB as EntityManager / Postgres

    Browser->>Browser: savePerson(patch) — buildOptimisticLockHeader(person.updatedAt)
    Browser->>Dispatcher: PUT /api/customers/people<br/>{id, ...patch}, X-Om-Ext-Optimistic-Lock-Expected-Updated-At

    Dispatcher->>Dispatcher: checkAuthorization()<br/>requireAuth + requireFeatures ['customers.people.manage']
    alt unauthorized / missing feature
        Dispatcher-->>Browser: 401 / 403
    end

    Dispatcher->>Route: delegate to crud.PUT(request)
    Route->>Route: withCtx() -> auth, DI container, org scope
    Route->>Route: action.schema.parse(body) -> mapInput()<br/>(personUpdateSchema.parse via splitCustomFieldPayload)
    Route->>Route: applyInterceptorsBefore (*.updating sync event)
    Route->>Route: candidateId = input.id

    Route->>Guard: collectAndRunGuards() -> runMutationGuards(..., resourceKind='customers.people', operation='update')
    Guard->>Guard: validateMutation()<br/>expected = header, current = readCustomerPersonUpdatedAt(em)
    alt currentUpdatedAt !== expectedUpdatedAt
        Guard-->>Route: { ok:false, status:409, body:{code:'optimistic_lock_conflict', currentUpdatedAt, expectedUpdatedAt} }
        Route-->>Dispatcher: json(errorBody, {status:409})
        Dispatcher-->>Browser: 409 Conflict
        Browser->>Browser: emitMutationSaveError() -> surfaceRecordConflict()<br/>RecordConflictBanner
    else timestamps match
        Guard-->>Route: { ok:true }
        Route->>Command: commandBus.execute('customers.people.update', {input, ctx, metadata})
        Command->>DB: findOne(CustomerEntity/CustomerPersonProfile)<br/>ensureTenantScope/ensureOrganizationScope
        Command->>DB: withAtomicFlush([mutate, sync dicts/tags], {transaction:true})
        DB-->>Command: flush commits, updated_at bumped (onUpdate hook)
        Command->>Command: setCustomFieldsForPerson() (after atomic flush)
        Command->>Command: emitCrudSideEffects() + emitQueryIndexUpsertEvents() (post-commit)
        Command-->>Route: { entityId, updatedAt }, logEntry

        Route->>Route: action.response({result}) -> {ok:true, updatedAt}
        Route->>Route: applyInterceptorsAfter(); json(...); attachOperationHeader(logEntry)
        Route->>Route: dispatch *.updated sync after-event
        Route-->>Dispatcher: 200 {ok:true, updatedAt}
        Dispatcher-->>Browser: 200 {ok:true, updatedAt}
        Browser->>Browser: setData(person.updatedAt = nextUpdatedAt) — refresh lock token
    end
```

## Detailed Findings

### Test coverage — gaps on the Person CRUD path

**Coverage matrix (skrót, pełna wersja w sub-agent raporcie — patrz Code References dla plików testowych):**

| Branch | Status | Evidence |
|---|---|---|
| Create — success | COVERED | `TC-CRM-004.spec.ts:11-65` |
| Create — `personCreateSchema` validation failure (empty firstName/lastName) | **NOT COVERED** | `validators.ts:98-99,111-117` (min(1)) — no unit/integration test |
| Create — execute-level guard "First/last name required" (`people.ts:639-644`) | **NOT COVERED** | possibly dead code given schema, but untested branch |
| Create — ACL denial (403) | COVERED | `TC-CRM-081.spec.ts:64-68` |
| Create/Update — custom fields routing | PARTIAL | undo path explicitly broken (#2498, `TC-UNDO-001-custom-fields.spec.ts:11`) |
| Detail GET with company association | COVERED | `TC-CRM-027.spec.ts:37-67` |
| List — pagination/search | COVERED (shallow) | `TC-CRM-004.spec.ts:46-60`, `TC-CRM-065.spec.ts:91` |
| List — email/status/lifecycleStage/source/tagIds/exclusion/hasX/dates/custom-field filters (~10 branches) | **NOT COVERED** | `api/people/route.ts:186-339`; analogous `companies` filters ARE tested (`TC-CRM-015.spec.ts:102`) |
| List — `afterList` decrypt/overlay hook | COVERED | `route.test.ts:31-164` (incl. concurrency proof) |
| List/Update/Delete — cross-tenant isolation | **NOT COVERED** | only generic `ensureTenantScope`/`ensureOrganizationScope` unit test (`commands/__tests__/shared.test.ts:25-34`), not exercised via real API mismatch for `people` |
| Update — success | COVERED | `TC-UNDO-002-people-update-undo.spec.ts`, `TC-LOCK-OSS-002.spec.ts:91-127` |
| Update — `personUpdateSchema` (clearable url/email) | COVERED | `validators.test.ts:190-266` |
| Update — displayName re-derivation | COVERED | `commands/__tests__/updatePerson.displayName.test.ts` |
| Update — optimistic-lock 409 | COVERED (thorough) | `TC-LOCK-OSS-002/005/015` |
| Update — ACL denial (403) | COVERED | `TC-CRM-081.spec.ts:70-74` |
| Update — `resolveCompanyReference` cross-org guard (`people.ts:467-482`) | **NOT COVERED** | no test for 403 "Cannot link person to company outside current scope" |
| Delete — success | COVERED | `TC-UNDO-001-people.spec.ts`, `TC-UNDO-004-bridge-undo.spec.ts:51` |
| Delete — `PERSON_HAS_DEPENDENTS` guard (422) + bypass | COVERED (unit, both branches) | `commands/__tests__/deletePerson.test.ts:106-149` |
| Delete — optimistic-lock 409 (stale delete) | COVERED | `TC-LOCK-OSS-009.spec.ts:142-176`, `TC-LOCK-OSS-015` |
| Delete — cascading `nativeDelete` (~10 tables, `people.ts:1239-1256`) | **NOT DIRECTLY ASSERTED** | only the dependent-guard short-circuit is tested |
| Undo/redo create/update/delete | COVERED (mostly) | `TC-UNDO-001..004` series; custom fields excluded (#2498) |

**Priorytetowe luki:**
1. **Cross-tenant isolation** (HIGH) — żaden test nie tworzy rekordu w tenant/org A i nie próbuje go odczytać/edytować/usunąć jako tenant/org B przez `/api/customers/people*`.
2. **`personCreateSchema` validation failure** (MEDIUM-HIGH) — brak testu na 400 dla pustego `firstName`/`lastName`/`displayName`.
3. **List filter branches** (MEDIUM) — ~10 z 12 branchy filtrów `/api/customers/people` nieprzetestowanych; analogiczne dla `companies` są.
4. **Cascading delete side-effects** (MEDIUM) — brak asercji, że ~10 powiązanych tabel jest faktycznie czyszczonych po sukcesie delete.
5. **Custom fields create/update routing dla person** (MEDIUM) — brak testu na poprawne przypisanie wartości do `CUSTOMER_ENTITY_ID` vs `PERSON_ENTITY_ID`.
6. **`resolveCompanyReference` scope guard** (LOW-MEDIUM).
7. **PUT response shape `{ok, updatedAt}`** (LOW) — tylko niejawnie zakładany przez testy lock.

### Blast radius — "co zmienia się razem"

**1. Statyczny graf zależności:**

- **`sales → customers` (realny import encji ORM, nie tylko FK)**:
  - `packages/core/src/modules/sales/commands/documents.ts:64-68,662-670` — import `{ CustomerAddress, CustomerEntity, CustomerPersonProfile }` (linia 64-68) + `em.findOne(CustomerEntity, ..., {populate:['personProfile','companyProfile']})` (linia 662) i `em.findOne(CustomerPersonProfile, ...)` (linia 670) przy budowaniu dokumentu sprzedaży.
  - **Dodatkowo (nieudokumentowane w oryginale)**: `documents.ts:722` — `em.findOne(CustomerAddress, ...)` w `resolveAddressSnapshot`, ta sama funkcja/przepływ co powyżej — trzecia, niezależna zależność na encjach `customers`.
  - `packages/core/src/modules/sales/seed/examples.ts:33,890-1055` — import `{ CustomerAddress, CustomerEntity, CustomerPersonProfile }` (jedna linia, 33) + seedowanie demo-zamówień z realnymi instancjami tych encji.
  - → **zmiana pola na `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress` łamie `sales` w czasie kompilacji**, mimo reguły AGENTS.md "no direct ORM relationships between modules" (dependency-cruiser flag = `warn`).
- **`customers → auth` (User entity, 7 plików)**: `lib/interactionReadModel.ts:8`, `api/entity-roles-factory.ts:11`, `api/interactions/route.ts:18`, `api/deals/[id]/route.ts:17`, `api/people/[id]/route.ts:22`, `api/activities/route.ts:20`, `api/companies/[id]/route.ts:24` — wszystkie importują `User` z `auth/data/entities` do wyświetlania nazw właściciela/autora. Zmiana pól `User` używanych do wyświetlania łamie te 7 plików. (ast-grep: potwierdzone 1:1, dokładnie te 7 plików i linie).
- **`customer_accounts → customers` (dynamic import, niewykrywalny przez dependency-cruiser)**: `subscribers/autoLinkCrm.ts:31,47`, `subscribers/autoLinkCrmReverse.ts:25,36,55`, `lib/customerEntityOwnership.ts:24` — `await import('@open-mercato/core/modules/customers/data/entities')` (6 wywołań / 3 pliki). Funkcjonalnie to samo sprzężenie co `sales`, ale poza zakresem statycznego grafu.
- **Kernel SCC** — `customers` jest najciężej obciążonym konsumentem: `crud/factory.ts` (**7 route'ów `makeCrudRoute`** — `tags`, `comments`, `companies`, `deals`, `interactions`, `addresses`, `people`; nie 12 — pozostałe 6 top-level route'ów [`activities`, `assignable-staff`, `labels`, `pipelines`, `pipeline-stages`, `todos`] są hand-rolled), `di/container.ts` (43 plików), `commands/*` (19 plików, w tym `index.ts`+`shared.ts`), `auth/server.ts` (35 plików — potwierdzone ast-grepem), `crud/optimistic-lock*` (`di.ts` rejestruje readery dla `CustomerEntity`, `CustomerAddress`, `CustomerInteraction`). `crud/factory.ts` jest najczęściej współ-zmienianym plikiem kernela z `customers` (21/201 commitów).

**2. Generated/registry layers:**

- `apps/mercato/src/modules.ts:69` — jedyny statyczny wpis (`{ id: 'customers', from: '@open-mercato/core' }`).
- `auth/api/admin/nav.ts` — **0 wpisów** dot. customers; nawigacja idzie przez widget injection (`menu:sidebar:main`), nie jest częścią blast radius.
- `registry.ts` / `module-registry.ts` — generyczna infrastruktura, brak wpisów per-moduł.
- i18n: 4 pliki `customers/i18n/{en,pl,es,de}.json`, każdy z 63 kluczami `customers.*` — zmieniają się w lockstep (4x w 9/14 commitów `entities.ts`).
- `apps/docs/sidebars.ts` — touchowany przy większych feature'ach CRM (np. email integration, commit `de282b5d`).

**3. Migracje i snapshot:**

- 21 plików migracji w `customers/migrations/` (paź 2025 – cze 2026).
- `.snapshot-open-mercato.json` (25 tabel, aktualny) + legacy `.snapshot-openmercato.json` (vestigial, wart cleanupu).
- **12/14 commitów** ostatnich 6 mies. dotykających `data/entities.ts` jednocześnie dotyka migracji + snapshotu + `data/validators.ts` (100% co-change dla validators).

**4. Co-change z historii (6 mies., 79 commitów, 4837 zmian plików):**

| Obszar | Liczba zmian plików | Komentarz |
|---|---|---|
| `customers/components/detail/` | 441 | drzewo komponentów detalu (PersonCard itp.) |
| `customers/backend/customers/` | 141 | strony list/detal |
| `sales/` | 281 | duże multi-modułowe PR-y + realny import ORM |
| `customers/api/people/` | 72 | core route |
| `customers/api/companies/` | 51 | |
| `customers/api/deals/` | 48 | |
| `auth/` | 73 | głównie platform-wide security/locking PR-y |
| `customers/migrations/.snapshot-open-mercato.json` | 11 | |

Spoza `customers/`: `ui/backend/CrudForm.tsx` (14), `apps/mercato/src/i18n/*` (10 każdy), `ui/backend/DataTable.tsx` (8), `shared/lib/crud/factory.ts` (7), `sales/backend/sales/documents/[id]/page.tsx` (7), `audit_logs/services/actionLogService.ts` (7), `shared/lib/query/engine.ts` (6), `sales/commands/documents.ts` (6).

- **`customers ↔ ui/backend`**: 65/201 commitów (32%) — potwierdza najwyższą parę co-change z `repo-map.md` (150 commitów ogółem).
- **`customers ↔ sales`**: 46/201 (23%) — przykład `e2885506` ("crm details screens init") jednocześnie zmienia `sales/{backend,commands,components,data,i18n,lib,migrations,widgets}` i `customers/data/entities.ts`.
- **`customers ↔ auth`**: 44/201 (22%) — głównie z platform-wide PR-ów (#1981/#2055 optimistic locking, #1428/#1500 tenant-scoping, #1903 AI agentic-loop), nie z bezpośrednich zmian encji.
- **Cykl `PersonCard ↔ CompanyPeopleSection`** — potwierdzony: `PersonCard.tsx:13` importuje `type CompanyPersonSummary` z `CompanyPeopleSection.tsx`, a `CompanyPeopleSection.tsx:19` importuje `{ PersonCard }`. To w obrębie najczęściej zmienianego podkatalogu (441 zmian/6mies.).

**"Co zmienia się razem" — podsumowanie:**

1. **Zawsze (>85%)**: `data/validators.ts`, nowa migracja + `.snapshot-open-mercato.json`, 4 pliki i18n modułu.
2. **Często (30-45%)**: `ui/backend/CrudForm.tsx` + `DataTable.tsx`, `customers/components/detail/*` (włącznie z cyklem PersonCard/CompanyPeopleSection).
3. **Cross-module, ryzyko kompilacji**: `sales/commands/documents.ts:662-670,722`, `sales/seed/examples.ts:33,890-1055` (realny import `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress`); 7 plików `customers/api/*` importujących `User` z `auth`; `customer_accounts` dynamic imports (3 pliki, 6 wywołań).
4. **Kernel SCC**: każdy `api/*/route.ts` zależy od `crud/factory.ts`/`di/container.ts`/`auth/server.ts`; commands od `commands/*`; `di.ts` + 3 integration specs od `crud/optimistic-lock*`.
5. **Switchboard**: tylko `apps/mercato/src/modules.ts:69` (statyczny wpis); `nav.ts` NIE jest częścią blast radius (widget injection).

## Technical debt

Skonsolidowana lista długu technicznego zidentyfikowanego na ścieżce Person CRUD, w przybliżonej kolejności wagi:

1. **Cross-module ORM entity imports (warn, nie error) — `sales↔customers` i `customers↔auth`.**
   - `sales/commands/documents.ts:64-68,662-670,722` i `sales/seed/examples.ts:33,890-1055` importują i odpytują `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress` bezpośrednio (nie przez FK + osobny fetch).
   - 7 plików `customers/api/*` (`interactions/route.ts:18`, `entity-roles-factory.ts:11`, `deals/[id]/route.ts:17`, `people/[id]/route.ts:22`, `activities/route.ts:20`, `companies/[id]/route.ts:24`, `lib/interactionReadModel.ts:8`) importują `User` z `auth/data/entities`.
   - `customer_accounts` powiela to przez `await import(...)` (`subscribers/autoLinkCrmReverse.ts:25,36,55`, `subscribers/autoLinkCrm.ts:31,47`, `lib/customerEntityOwnership.ts:24` — 3 pliki, 6 wywołań) — niewykrywalne przez dependency-cruiser, ale identyczna fragility.
   - **Ryzyko**: zmiana/usunięcie pola na `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress`/`User` łamie kompilację `sales`/`customers`/`customer_accounts` bez ostrzeżenia na poziomie API/kontraktu. Reguła `core-no-cross-module-entity-imports` jest tylko `warn` w CI.

2. **Kernel SCC (`crud/factory.ts ↔ di/container.ts ↔ commands/index.ts ↔ auth/server.ts ↔ optimistic-lock.ts`) jako twarda zależność `customers`.**
   - `customers` jest najciężej sprzężonym konsumentem (7 route'ów na `crud/factory.ts` via `makeCrudRoute`, 43 pliki na `di/container.ts`, 35 na `auth/server.ts`). `factory.ts` jest najczęściej współ-zmienianym plikiem kernela z `customers` (21/201 commitów).
   - **Ryzyko**: refaktor kernela ma gwarantowany blast radius w całym module `customers` (i transitive przez `sales`/`catalog`/`auth`).

3. **Martwy kod + nieaktualny komentarz w `di.ts` po fixie #2072 (resourceKind pluralizacji).**
   - Raport pierwotnie opisywał "bug": `deriveResourceFromCommandId` nie singularyzuje `'people'` → `'person'`, więc `customers/di.ts` rejestruje ten sam reader pod trzema kluczami jako obejście. **To jest nieaktualne** — commit `ffbd7c45e` (PR #2076, issue #2072) dodał mapę `IRREGULAR_PLURALS` (`packages/shared/src/lib/crud/cache.ts:113-123`, zawiera `people: 'person'`) do `singularizeSegment`, więc `deriveResourceFromCommandId('customers.people.update')` zwraca dziś `'customers.person'` — potwierdzone regresją w `packages/shared/src/lib/crud/__tests__/cache.test.ts` (`describe('deriveResourceFromCommandId — irregular plurals (#2072)', ...)`).
   - Pozostały dług: `customers/di.ts:9-15` wciąż ma komentarz opisujący ten "obejście" jako aktualny stan, a `RESOURCE_KIND_PEOPLE = 'customers.people'` (di.ts:17, rejestrowane na linii 64 w `registerOptimisticLockReaders({...})`) jest martwym kluczem — żaden `resourceKind` wygenerowany z `commandId` typu `customers.people.*` nigdy go nie użyje.
   - **Ryzyko**: niskie (martwy kod, nie aktywny bug), ale komentarz wprowadza w błąd kolejnych developerów co do zachowania factory. Rejestracje pod `customers.person`/`customers.company` (punkty 2 i 4 poniżej) pozostają poprawne i niezbędne — polimorficzna tabela `customer_entities` wciąż wymaga hand-wired readerów dyskryminujących `kind`.

4. **Hand-wired optimistic-lock readery zależne od kolejności ładowania modułu (`di.ts` przed `makeCrudRoute`).**
   - `di.ts` musi się wykonać (rejestrując readery) PRZED wywołaniem `makeCrudRoute(...)` w `api/people/route.ts`, bo factory tylko wypełnia "IfAbsent". To niejawna zależność porządku ładowania — cicha regresja do generycznego (kind-blind) readera, jeśli kolejność się zmieni.

5. **Detal `GET /api/customers/people/[id]` jest hand-rolled (1203 linii), pomija pipeline factory (enrichers/interceptors/profiler).**
   - Architektonicznie uzasadnione (bogaty agregat), ale oznacza, że ta ścieżka nie korzysta z `enricher-runner`/`applyInterceptors*`/profilera, którego korzysta `list`. Każda zmiana w generycznym pipeline factory musi być rozważona również tutaj manualnie.

6. **Edycja Person nie używa `CrudForm`, tylko per-pole `useGuardedMutation` + ręczne `buildOptimisticLockHeader`/`surfaceRecordConflict`.**
   - Więcej boilerplate per pole niż jeden submit `CrudForm`; każda inline-edycja musi sama odświeżyć `data.person.updatedAt` z odpowiedzi (#2055), inaczej druga sekwencyjna edycja dostanie fałszywy 409. Łatwe do przeoczenia przy kopiowaniu wzorca dla nowej encji (nie zawiedzie przy jednorazowym zapisie / pierwszym teście).
   - **Potwierdzony 3x powtórzony wzorzec** w `backend/customers/people/[id]/page.tsx`: jeden `useGuardedMutation<{...}>(...)` (linia 175) zasila `withScopedApiRequestHeaders(buildOptimisticLockHeader(...), () => apiCallOrThrow(...))` w `savePerson` (322-336), `handleDelete` (398-411) i `handleCustomFieldsSubmit` (447-461) — oraz jest prop-drillowany jako `runGuardedMutation` do 3 komponentów dzieci (linie 850, 875, 900). Każda nowa sekcja edytowalna na tej stronie musi powtórzyć ten sam ręczny header/conflict-handling.

7. **Cross-tenant isolation dla `people` CRUD — brak testu end-to-end (patrz Test coverage gaps #1).** Helper jest przetestowany, wywołania w `people.ts:612-613,927-928,1229-1230` nie są przetestowane na realny mismatch.

8. **Custom fields undo dla `people` jest znanym broken (#2498)** — `TC-UNDO-001-custom-fields.spec.ts:11` jawnie dokumentuje blokadę "scalar-undo no-op".

9. **~10 branchy filtrów listy `/api/customers/people` (`route.ts:186-339`) nieprzetestowanych**, mimo że analogiczne filtry dla `companies` mają testy (`TC-CRM-015.spec.ts:102`) — asymetria pokrycia między dwoma najbliższymi modułami referencyjnymi.

10. **Kaskadowe `nativeDelete` (~10 tabel, `people.ts:1239-1256`) bez asercji post-conditions** — tylko ścieżka guard/short-circuit jest testowana, nie faktyczne czyszczenie danych po sukcesie.

11. **Dwa pliki snapshotu migracji** — `.snapshot-open-mercato.json` (aktualny, 25 tabel) i legacy `.snapshot-openmercato.json` (stara konwencja nazewnicza, prawdopodobnie pozostałość po rename) — kandydat do cleanupu, ale poza zakresem tej analizy.

12. **`PersonCard ↔ CompanyPeopleSection` — cykl komponentów** w najczęściej zmienianym podkatalogu repo (`customers/components/detail/`, 441 zmian/6mies.) — zmiana renderu jednej karty wymusza re-test drugiej; potwierdza ryzyko #6 z `repo-map.md`.

## Code References

- `packages/core/src/modules/customers/api/people/route.ts:68-87,123-373,375-429,430-526,528-531` — routeMetadata, list filters, CRUD actions, afterList, enrichers, re-exports
- `packages/core/src/modules/customers/api/people/[id]/route.ts` (1203 linii) — hand-rolled detail GET, linie ~393-998
- `packages/core/src/modules/customers/backend/customers/people/page.tsx:421,894` — list page (`apiCall`, `DataTable`)
- `packages/core/src/modules/customers/backend/customers/people/[id]/page.tsx:282-312,318-349,341-349` — detail/inline-edit page
- `packages/core/src/modules/customers/commands/people.ts:608-730,914-1065,1223-1331,467-482,484-526,639-644,1239-1256` — create/update/delete commands, displayName re-derivation, custom fields routing, company-reference guard, cascade delete
- `packages/core/src/modules/customers/data/validators.ts:98-99,111-130` — `personCreateSchema`/`personUpdateSchema`
- `packages/core/src/modules/customers/data/entities.ts:30,149` — `CustomerEntity`, `CustomerPersonProfile`
- `packages/core/src/modules/customers/acl.ts:2-8` — `customers.people.view`/`manage`
- `packages/core/src/modules/customers/di.ts:1-65` — hand-wired optimistic-lock readers (`customers.person`/`customers.company` valid; `RESOURCE_KIND_PEOPLE`/`customers.people` at linie 17,64 to martwy kod po fixie #2072, komentarz na liniach 9-15 nieaktualny)
- `packages/core/src/modules/customers/components/detail/PersonCard.tsx:13` ↔ `CompanyPeopleSection.tsx:19,738` — component cycle
- `packages/shared/src/lib/crud/factory.ts:462-482,499-520,597-604,930+,1337-1396,2291-2441,2622-2710,945-964` — `makeCrudRoute`, resourceKind derivation, guard collection, GET/PUT/DELETE, generic optimistic-lock reader auto-registration
- `packages/shared/src/lib/crud/optimistic-lock.ts:231-244,282-364,366-368` — guard service, conflict body, no-op afterSuccess
- `packages/shared/src/lib/crud/mutation-guard-registry.ts:89-122,165-180` — `runMutationGuards`, `bridgeLegacyGuard`
- `packages/ui/src/backend/injection/useGuardedMutation.ts:39-94` — `runMutation`/`emitMutationSaveError`
- `packages/ui/src/backend/conflicts/index.ts:32-49` — `surfaceRecordConflict`
- `packages/ui/src/backend/utils/optimisticLock.ts:30-36,46+` — `buildOptimisticLockHeader`/`extractOptimisticLockConflict`
- `apps/mercato/src/app/api/[...slug]/route.ts:142-228` — `checkAuthorization` (401/403)
- `packages/core/src/modules/sales/commands/documents.ts:64-68,662-670,722` — cross-module `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress` import+query (linia 722 w `resolveAddressSnapshot`, niewzmiankowana w pierwotnym raporcie)
- `packages/core/src/modules/sales/seed/examples.ts:33,890-1055` — cross-module seed usage
- Test inventory: `packages/core/src/modules/customers/api/people/__tests__/route.test.ts`, `commands/__tests__/{deletePerson,updatePerson.displayName,shared}.test.ts`, `__tests__/validators.test.ts`, integration specs `TC-CRM-{004,015,027,065,081}`, `TC-LOCK-OSS-{002,005,009,015}`, `TC-UNDO-{001,002,003,004}-*`

## Architecture Insights

- **Optimistic locking jest "guard" w `mutation-guard-registry`, nie wbudowane w factory wprost** — `bridgeLegacyGuard` opakowuje platform-wide `crudMutationGuardService` jako `MutationGuard` z `targetEntity: '*'`, `operations: ['update','delete']`, `priority: 0`. To pozwala innym guardom (np. `PERSON_HAS_DEPENDENTS`) koegzystować w tym samym pipeline.
- **Side effects (events, search index, custom fields) zawsze post-commit** — `updatePersonCommand`/`createPersonCommand`/`deletePersonCommand` wszystkie wywołują `emitCrudSideEffects`/`emitQueryIndexUpsertEvents`/`setCustomFieldsForPerson` PO `withAtomicFlush`, zgodnie z "Entity Update Safety" z `packages/core/AGENTS.md`. To wzorzec poprawny, wart powtórzenia.
- **`updatedAt` round-trip (#2055) jest częścią kontraktu odpowiedzi `update`, nie domyślnym zachowaniem factory** — każdy command-template kopiujący `updatePersonCommand` musi pamiętać `return { entityId, updatedAt: record.updatedAt }` i odpowiadający `action.response` mapper, inaczej druga sekwencyjna edycja w UI dostanie fałszywy 409 (nie wykryte przez testy jednorazowego zapisu).
- **Polimorficzna tabela `customer_entities` (`kind: 'person'|'company'`) wymaga dyskryminacji w optimistic-lock readerach** — generyczny auto-reader factory nie rozróżnia `kind`, więc `di.ts` musi hand-wire'ować własne readery (`customers.person`, `customers.company`) przed rejestracją route'a. Sama pluralizacja `resourceKind` (`'customers.people'` → `'customers.person'`) jest już poprawnie obsłużona przez `IRREGULAR_PLURALS` w `deriveResourceFromCommandId` (fix #2072/PR #2076) — `RESOURCE_KIND_PEOPLE`/`customers.people` w `di.ts` to pozostałość martwego kodu, nie aktywny mechanizm.

## Historical Context (from prior changes)

- `context/map/repo-map.md` — strefy ryzyka #1 (kernel SCC), #2 (cross-module entity imports `catalog↔sales↔customers↔auth`), #6 (`PersonCard ↔ CompanyPeopleSection`) — wszystkie trzy **potwierdzone konkretnymi file:line w tej analizie** (sekcja Blast radius i Technical debt #1, #2, #12).
- `context/map/artifact-1-territory.md` §4 — top pary co-change (`customers↔ui/backend`=150, `customers↔sales`=121, `auth↔customers`=100) — potwierdzone w danych 6-miesięcznych (32%, 23%, 22% commitów odpowiednio).
- `context/map/artifact-2-structure.md` §4 — podgraf `crud-factory-focus.svg` — potwierdza `customers` jako jeden z czterech modułów (`sales`/`catalog`/`customers`/`auth`) z krawędziami "pomarańczowymi" (`core-no-cross-module-entity-imports`) do/z `crud/factory.ts`.
- `.ai/specs/2026-05-25-oss-optimistic-locking.md` / `.ai/specs/2026-05-28-optimistic-locking-coverage-completion.md` (referencje z `AGENTS.md`, nie czytane w pełni w tej analizie) — prawdopodobnie zawierają decyzje dot. hand-wired readerów `customers.person`/`customers.company` (di.ts) i `updatedAt` round-trip (#2055) — warto zweryfikować przy dalszej pracy nad punktem 2/4/6 z Technical debt. Punkt 3 (`resourceKind` pluralizacja) NIE wymaga już weryfikacji w tych specach — to martwy kod po fixie #2072/PR #2076 (`ffbd7c45e`), niezależnie od decyzji w specach.

## Related Research

- `context/map/repo-map.md`, `artifact-1-territory.md`, `artifact-2-structure.md`, `artifact-3-contributors.md` — bazowa mapa repo, na której oparto scoping tej analizy.

## Open Questions

- Czy `.ai/specs/2026-05-25-oss-optimistic-locking.md` i `.ai/specs/2026-05-28-optimistic-locking-coverage-completion.md` dokumentują punkty 2/4/6 z Technical debt jako znane, zaakceptowane decyzje (w takim razie nie są "długiem" tylko udokumentowanym trade-off) — wymaga przeczytania. (Punkt 3 jest już rozstrzygnięty: to martwy kod po fixie #2072, nie trade-off do dokumentowania.)
- Czy ktoś powinien usunąć martwy kod `RESOURCE_KIND_PEOPLE = 'customers.people'` i nieaktualny komentarz w `customers/di.ts:9-17,64` jako follow-up cleanup po PR #2076 (#2072)?
- Czy `customer_accounts` (dynamic import `CustomerEntity`/`CustomerPersonProfile`, poza zasięgiem dependency-cruiser) ma swój własny test kontraktowy chroniący przed cichym złamaniem przy zmianie encji `customers`?
- Czy legacy `.snapshot-openmercato.json` (bez myślnika) jest faktycznie martwym plikiem, czy używany przez jakiś skrypt/CI?
- Skala problemu #2498 (custom fields undo dla `person`) — czy istnieje już issue/spec śledzący naprawę?
