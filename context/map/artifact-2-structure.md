# Artefakt 2 — Struktura zależności i ryzyka testowalności (dependency-cruiser)

> Wygenerowano: 2026-06-11. Narzędzie: `yarn depcruise` (dependency-cruiser 17.4.3), config `.dependency-cruiser.cjs` + `.dependency-cruiser.tsconfig.json`, zakres `packages apps/mercato/src`.
>
> Dane źródłowe: pełny graf zależności (`yarn depcruise --output-type json packages apps/mercato/src`), zinterpretowany w kontekście "terytorium aktywności" z [`artifact-1-territory.md`](./artifact-1-territory.md) (top-10 modułów wg liczby zmian w 12 mies., sprzężenia co-change).
>
> Reguły dependency-cruiser użyte do analizy: `no-circular` (warn), `shared-no-domain-deps` (warn), `packages-no-app-deps` (error), `oss-no-enterprise-deps` (error), `core-no-cross-module-entity-imports` (warn).

## 1. Cykle i naruszenia granic w aktywnych obszarach

dependency-cruiser zgłasza ostrzeżenia `no-circular` i `core-no-cross-module-entity-imports` skoncentrowane dokładnie w modułach z top-10 aktywności (artifact-1):

| Cykl / naruszenie | Moduły | Dlaczego komplikuje zmiany | Związek z artifact-1-territory.md |
|---|---|---|---|
| **"Kernel SCC"**: `crud/factory.ts` ↔ `di/container.ts` ↔ `commands/index.ts` ↔ `auth/server.ts` ↔ `crud/optimistic-lock.ts` | `packages/shared/src/lib/{crud,di,auth,commands}` | Rdzeń, przez który przechodzi *każdy* `makeCrudRoute` (47 importerów w aktywnych obszarach), ma sprzężenie zwrotne — nie da się "podmienić jednego serwisu na mock" bez pociągnięcia całego SCC | `crud/factory.ts` = top #6 plików wg zmian (78), `shared/lib` = #6 modułów (1038 zmian) |
| **`core-no-cross-module-entity-imports`**: `catalog↔sales`, `sales↔customers`, `customers↔auth` | `catalog`, `sales`, `customers`, `auth` | Bezpośrednie importy encji ORM między modułami domenowymi — zmiana modelu danych w jednym module może złamać typy/zapytania w drugim bez ostrzeżenia na poziomie API | Pokrywa się 1:1 z top parami co-change: `catalog↔sales`=121, `customers↔sales`=121, `auth↔customers`=100 |
| **`ui/backend ↔ ai_assistant`**: `AppShell.tsx`/`HeaderContext` ↔ `conversation-store.ts`/`useAiChat` | `packages/ui/src/backend`, `packages/ui/src/ai` | Powłoka adminowa i asystent AI nie są od siebie izolowane — zmiana w renderze AppShella może wymagać zamockowania globalnego store'u rozmów AI, i odwrotnie | `ui/backend` = #2 (1737 zmian, "hub" — 419 commitów ze sprzężeniami), `ai_assistant` = #10, nowy moduł Q3 (530 zmian) |
| **`customers`**: `PersonCard` ↔ `CompanyPeopleSection` | komponenty detali `customers/backend/customers/{people,companies}` | Wzajemna zależność komponentów sekcji szczegółów osoby/firmy — zmiana renderu jednej karty wymusza re-test drugiej | `customers` = #1 (3177 zmian), trio `customers+dictionaries+ui/backend`=13 |
| **`workflows`**: `step-handler` ↔ `parallel-handler` ↔ `transition-handler` ↔ `workflow-executor` | `packages/core/src/modules/workflows` (silnik wykonawczy) | Wzajemnie zależne handlery kroków, wszystkie importujące `EntityManager`/`AwilixContainer`/`EventBus` — silnik jest stanowy i transakcyjny, trudny do podziału na niezależne jednostki | `workflows` = #8 (783 zmian), top-5 w Q2 |

**Wniosek**: granice warstw (`shared` bez zależności domenowych, `packages` bez zależności od `apps`, OSS bez `enterprise`, brak importów encji między modułami `core`) są w większości respektowane jako reguły **error** (twarde), ale `no-circular` i `core-no-cross-module-entity-imports` pozostają na poziomie **warn** i koncentrują się dokładnie w najaktywniejszych modułach — co oznacza, że największy "ciężar architektoniczny" repo nie jest dziś egzekwowany przez CI jako blokujący.

## 2. Ryzyka testowalności — podsumowanie

| Strefa ryzyka | Przykłady (plik / moduł, fan-out) | Konsekwencja dla testów |
|---|---|---|
| **Dużo mockingu (unit, frontend)** | `CrudForm.tsx` (44 zal., #1 plik wg zmian — 158), `DataTable.tsx` (44 zal., 94 zmian), `AppShell.tsx` (33 zal., 79 zmian, definiuje `HeaderContext`), strony detali `customers/.../[id]/page.tsx` (24-34 zal.), `ui/src/ai/conversation-store.ts` (globalny store) | Każdy z nich ciągnie `apiCall` + globalne konteksty (`HeaderContext`, `BackendChromeContext`, `conversation-store`) + rejestr custom-fieldów. Mockowanie jest możliwe (16 istniejących testów w `ui/backend/__tests__`), ale wymaga dostarczenia providerów i resetu globalnego stanu między testami. |
| **Naturalny test integracyjny** | `sales/commands/documents.ts` (36 zal., #9 plik wg zmian — 68, encje z `catalog`+`customers`+`dictionaries`+`entities`), wszystko zbudowane na `crud/factory.ts` (47 importerów: `sales`=22, `catalog`=9, `customers`=9, `auth`=4), `auth/commands/users.ts` (26 zal.), `catalog/commands/products.ts` (20 zal.), `bootstrap/factory.ts` (19 zal., składa cały runtime), hand-rolled route'y `customer_accounts/api/admin/*` (48 importów `di/container` — najwyższy wynik ze wszystkich obszarów) | Mockowanie kontenera DI + command-bus + enricherów + `auth/server` jest droższe niż uruchomienie testu na realnej (testowej) bazie. Istniejący wzorzec: `__tests__`/`__integration__` z `packages/cli/src/lib/testing/{integration,runtime-utils,integration-discovery}.ts`. |
| **Naturalny e2e** | Zmiany w "switchboard" (`shared/modules/registry.ts`, `apps/mercato/src/modules.ts`, `cli/lib/generators/module-registry.ts` — 219-239 dystynktywnych modułów dotykających tych plików), `workflows/.../visual-editor/page.tsx` + silnik wykonawczy, zmiany przekraczające trio `customers+sales+ui/backend` (21 commitów co-change), end-to-end optimistic locking (command guard + UI conflict bar) | Weryfikacja wymaga uruchomienia całej aplikacji (rejestracja modułu wpływa na wszystkie inne; edycja workflow w UI → wykonanie → efekt w bazie; zmiana w jednym z trio prawie zawsze pociąga pozostałe dwa). |

## 3. Najbardziej podejrzane moduły (ranking)

| # | Moduł / plik | Dlaczego | artifact-1 |
|---|---|---|---|
| 1 | `customers` | apiCall=65, commands_index=62, di_container=40, auth_server=35 — najwyższe wartości niemal w każdej kategorii ryzyka | #1 aktywności (3177), 45% co-change z `ui/backend` |
| 2 | `ui/src/backend` (CrudForm/DataTable/AppShell) | 3 z top-5 plików wg fan-out (44/44/33), globalne konteksty, cykl z `ai_assistant` | #2 aktywności (1737), hub — 419 commitów ze sprzężeniami |
| 3 | `sales/commands/documents.ts` + heavy users `crud/factory.ts` | 36 zal. obejmujących 4 moduły encji; `sales` ma najwięcej route'ów na `crud/factory` (22) | #3 aktywności (1688), 47% co-change z `catalog`/`customers` |
| 4 | `catalog/commands/products.ts` | commands_index=18, crud_factory=9, ściśle sprzężony z `sales` | #4 aktywności (1194), 121 co-change z `sales` |
| 5 | `auth/commands/users.ts` + RBAC kernel | 26 zal., di_container=20, centralny dla uprawnień konsumowanych wszędzie | #5 aktywności (1163), 100 co-change z `customers` |
| 6 | `customer_accounts/api/admin/*` | di_container=48 (najwyższe!), crud_factory=0 — hand-rolled handlery, nowy moduł | #9 aktywności (601), nowy w Q3 |
| 7 | `ai_assistant` + `ui/src/ai/conversation-store.ts` | di_container=30, auth_server=27, globalny store w cyklu z `useAiChat` | #10 aktywności (530), nowy w Q3 |
| 8 | `workflows` (silnik + visual-editor) | visual-editor=20 zal., silnik wykonawczy stanowy z cyklem handlerów | #8 aktywności (783) |
| 9 | `shared/lib/bootstrap/factory.ts` + rejestry (`registry.ts`/`overrides.ts`) | 19 zal. składających cały runtime; 49 importerów rejestrów | #6 aktywności (1038), "switchboard" |
| 10 | `create-app/template/...` | di_container=16, auth_server=14, apiCall=14 — osobne ryzyko "template-sync" | #7 aktywności (979), Q3 "mocno strojony" |

## 4. Podgraf: "blast radius" `crud/factory.ts`

Plik: [`crud-factory-focus.svg`](./crud-factory-focus.svg) — wygenerowany przez:

```bash
yarn depcruise packages apps/mercato/src \
  --config .dependency-cruiser.cjs \
  --include-only "^packages/shared/src/lib/(crud/factory\.ts|auth/server\.ts|commands/index\.ts|di/container\.ts|crud/enricher-runner\.ts|crud/response-enricher\.ts|crud/optimistic-lock\.ts)$|^packages/core/src/modules/(sales|catalog|customers|auth)/" \
  --collapse "^packages/core/src/modules/[^/]+" \
  --output-type dot \
| dot -T svg -o context/map/crud-factory-focus.svg
```

**Pytanie, na które odpowiada**: jeśli zmienia się `crud/factory.ts` (kernel `makeCrudRoute`, top #6 plików wg zmian), jaki jest promień rażenia wśród `sales`/`catalog`/`customers`/`auth`, i co sam `factory.ts` ciągnie ze sobą (DI container, `auth/server`, command bus, enrichery, optimistic-lock)?

**Kluczowe obserwacje z grafu**:
- `crud/factory.ts` ma 6 bezpośrednich krawędzi do kernela (`auth/server`, `di/container`, `commands/index`, `enricher-runner`, `response-enricher`, `optimistic-lock`) — to minimalny zestaw mocków dla unit testu pojedynczego route'a.
- `sales`, `catalog`, `customers`, `auth` mają krawędzie zarówno do `crud/factory.ts`, jak i bezpośrednio do `auth/server`/`di/container`/`commands/index` — zależności nie są "schowane" wewnątrz factory.
- Przerywane krawędzie (`auth/server.ts → packages/core/src/modules/auth`, `di/container.ts → commands/index.ts`/`crud/optimistic-lock.ts`) potwierdzają kernel SCC z sekcji 1 — kernel zależy zwrotnie od `auth` i własnych konsumentów.
- Pomarańczowe krawędzie (`core-no-cross-module-entity-imports`): `catalog→sales`, `sales→catalog`, `sales→customers`, `customers→auth` — widoczne nawet po zwinięciu modułów do pojedynczych węzłów.
- `sales` ma najwięcej krawędzi wychodzących (8) — najsilniej sprzężony moduł, zmiana w `crud/factory.ts` uderza w niego najmocniej.

## 5. Co sprawdzić dalej

- Wzorzec mockowania `apiCall`: istniejące przykłady w `packages/ui/src/portal/__tests__/{PortalShell,PortalContext}.test.tsx`, `usePortalDashboardWidgets.test.tsx`, `backend/messages/__tests__/MessageComposer.test.tsx`, `backend/utils/__tests__/crud.test.ts` — rozważyć wydzielenie współdzielonego helpera.
- Harness DI/EntityManager: `packages/cli/src/lib/testing/{integration,runtime-utils,integration-discovery}.ts` (top plik Q3, 23 zmiany) jako punkt wyjścia dla nowych testów `customer_accounts`/`ai_assistant`.
- `customer_accounts`: 48 bezpośrednich importów `di/container` w hand-rolled route'ach (crud_factory=0) — sprawdzić, czy duplikują logikę resolve/auth utrudniając refaktoryzację do `makeCrudRoute`.
- AppShell/`conversation-store`: 0 bezpośrednich importów z poziomu modułów domenowych (`customers`/`sales`/`catalog`/`auth`/`workflows`/`customer_accounts`/`ai_assistant`) — konsumowane na poziomie layoutów `apps/mercato/src/app/**`, poza zasięgiem tej analizy.
- Bezpośrednie użycie `@mikro-orm`/`EntityManager` per moduł — graf nie łapie importów z `node_modules` (`doNotFollow`), a `auth/server.ts` i silnik `workflows` wyraźnie z nich korzystają.
- `.ai/qa/AGENTS.md` i skill `om-integration-tests` — zweryfikować zgodność udokumentowanych konwencji z granicami unit/integration/e2e zidentyfikowanymi tu empirycznie.
