# Artefakt 1 — Terytorium aktywności (analiza git, ostatnie 12 mies.)

> Wygenerowano: 2026-06-10. Zakres: `git log --since="12 months ago"` (3238 commitów, faktyczna historia repo zaczyna się 2025-09-10).
>
> Metodologia: pliki zagregowane do "modułów" wg konwencji:
> - `packages/<pkg>/src/modules/<module>` / `apps/<app>/src/modules/<module>`
> - `packages/<pkg>/src/<dir>` / `apps/<app>/src/<dir>`
> - w innych przypadkach: pierwsze dwa segmenty ścieżki
>
> Odfiltrowano szum: lockfile'y, `*.snapshot*.json`, `*.generated.*`, `.env*`, `package.json`, tłumaczenia per-moduł (`i18n/{en,pl,es,de,...}.json`), `AGENTS.md`/`README.md`, configi (`tsconfig`, eslint, jest/vitest, docker, CI), zrzuty ekranu z dokumentacji.

## 1. TOP 10 modułów/folderów (12 miesięcy)

| # | Moduł/folder | Zmiany |
|---|---|---|
| 1 | `packages/core/src/modules/customers` | 3177 |
| 2 | `packages/ui/src/backend` | 1737 |
| 3 | `packages/core/src/modules/sales` | 1688 |
| 4 | `packages/core/src/modules/catalog` | 1194 |
| 5 | `packages/core/src/modules/auth` | 1163 |
| 6 | `packages/shared/src/lib` | 1038 |
| 7 | `packages/create-app` | 979 |
| 8 | `packages/core/src/modules/workflows` | 783 |
| 9 | `packages/core/src/modules/customer_accounts` | 601 |
| 10 | `packages/ai-assistant/src/modules/ai_assistant` | 530 |

(`apps/docs` ~928 i `.ai/specs` ~816 to dokumentacja/specyfikacje — poza top 10 kodu.)

### Drill-down top 3

- **`customers`** → `components` (1019), `api` (606), `backend` (480), `__integration__` (335), `commands` (321) — moduł referencyjny CRUD, wzorzec dla nowych modułów.
- **`ui/src/backend`** → `utils` (184), `CrudForm.tsx` (158), `detail` (156), `__tests__` (144), `inputs` (123), `DataTable.tsx` (94) — rdzeń frameworka UI.
- **`sales`** → `components` (416), `api` (350), `commands` (232), `backend` (170), `__integration__` (168) — drugi co do złożoności moduł domenowy.

## 2. TOP 10 plików (12 miesięcy)

| # | Plik | Zmiany |
|---|---|---|
| 1 | `packages/ui/src/backend/CrudForm.tsx` | 158 |
| 2 | `packages/cli/src/mercato.ts` | 122 |
| 3 | `packages/ui/src/backend/DataTable.tsx` | 94 |
| 4 | `packages/core/src/modules/customers/backend/customers/people/[id]/page.tsx` | 86 |
| 5 | `packages/ui/src/backend/AppShell.tsx` | 79 |
| 6 | `packages/shared/src/lib/crud/factory.ts` | 78 |
| 7 | `packages/core/src/modules/sales/backend/sales/documents/[id]/page.tsx` | 77 |
| 8 | `packages/core/src/modules/query_index/lib/engine.ts` | 72 |
| 9 | `packages/core/src/modules/sales/commands/documents.ts` | 68 |
| 10 | `packages/shared/src/lib/query/engine.ts` | 58 |

**Weryfikacja istnienia**: wszystkie 10 plików nadal istnieje pod tymi samymi ścieżkami (`git ls-files` OK).

## 3. Podział na kwartały (od startu repo, 2025-09-10)

| Kwartał | Zakres | Commity | Zmiany plików (po filtrze) |
|---|---|---|---|
| Q1 | 2025-09-10 → 2025-12-10 | 1156 | 6773 |
| Q2 | 2025-12-10 → 2026-03-10 | 631 | 10959 |
| Q3 | 2026-03-10 → 2026-06-10 | 1443 | 12331 |

### Q1 — Fundament platformy i moduł referencyjny CRUD
Top moduły: `customers` (1025, 15%), `sales` (683), `catalog` (554), `ui/backend` (477), `auth` (438), `shared/lib` (302), `docs/docs` (296), `example` (291), `query_index` (251), `entities` (232).

Top pliki: `CrudForm.tsx` (77), `customers/.../people/[id]/page.tsx` (73), `mercato.ts` (53), `DataTable.tsx` (49), `crud/factory.ts` (47), **`src/app/(backend)/backend/layout.tsx`** (44).

➡️ Budowa szkieletu: `customers` jako wzorzec CRUD, równoległy rozwój `sales`/`catalog`/`auth`, fundamenty UI (`CrudForm`/`DataTable`), search (`query_index`), custom fields (`entities`). Moduł `example` aktywnie rozwijany jako referencja scaffoldingu.

### Q2 — Dokumentacja, procesy spec-driven, tooling create-app
Top moduły: `apps/docs` (694), `ui/backend` (629), `sales` (585), `customers` (497, 4.5%), `workflows` (467), `shared/lib` (383), `.ai/specs` (368), `.ai/qa` (360), `create-app` (350), `catalog` (345).

Top pliki: `mercato.ts` (40), `CrudForm.tsx` (34), `cli/lib/generators/module-registry.ts` (30), `apps/docs/sidebars.ts` (25), `apps/mercato/src/modules.ts` (23).

➡️ Faza dojrzewania procesu: `customers` chwilowo spada (15% → 4,5%). Uwaga przesuwa się na dokumentację, proces spec-driven (`.ai/specs`, `.ai/qa` pojawiają się masowo po raz pierwszy), nowy moduł `workflows`, oraz `create-app`.

### Q3 (bieżący) — Powrót do `customers`, portal klienta, AI assistant
Top moduły: `customers` (1655, 13.4% — najwyższa wartość bezwzględna roku), `ui/backend` (631), `create-app` (629), `customer_accounts` (601, nowy moduł), `.ai/specs` (448), `auth` (424), `sales` (420), `ai-assistant` (366, nowy moduł), `shared/lib` (353), `workflows` (316).

Top pliki: `CrudForm.tsx` (47), `.ai/lessons.md` (40), `mercato.ts` (29), `create-app/template/package.json.template` (28), `DataTable.tsx` (24), `cli/lib/testing/integration.ts` (23).

➡️ Ekspansja funkcjonalna: `customers` wraca na szczyt (prawdopodobnie duże inicjatywy: optimistic locking, polymorphic entities). Nowy moduł `customer_accounts` (portal klienta) i `ai-assistant`. `.ai/specs` utrzymuje wysoki poziom — proces spec-first ugruntowany. `.ai/lessons.md` (40 zmian) = aktywne stosowanie pętli "self-improvement". `create-app/template` mocno strojony — synchronizacja template'u z core.

### Trend ogólny
1. `customers` to stały "ciężki" moduł (15% → 4,5% → 13,4%) — naprzemiennie szablon referencyjny i poligon dla dużych funkcji.
2. `packages/ui/src/backend` (CrudForm/DataTable/AppShell) stabilnie w top 2-4 każdego kwartału — wspólny mianownik zmian frameworkowych.
3. Proces spec-driven + QA (`.ai/specs`, `.ai/qa`) wykrystalizował się w Q2 i utrzymuje się w Q3.
4. Wyraźna ekspansja produktowa: Q1 = core e-commerce (sales/catalog/auth) → Q2 = tooling/docs/workflows → Q3 = customer portal + AI assistant ("od silnika do produktów na silniku").

## 4. Sprzężenia (co-change coupling) między modułami

Metoda: dla każdego z 2602 commitów ze zmianami w ≥2 modułach liczone są pary/trójki współwystępujących modułów.

### TOP pary
| Zmiany | Para |
|---|---|
| 150 | `customers` ↔ `ui/backend` |
| 121 | `catalog` ↔ `sales` |
| 121 | `customers` ↔ `sales` |
| 116 | `customers` ↔ `shared/lib` |
| 112 | `sales` ↔ `ui/backend` |
| 104 | `shared/lib` ↔ `ui/backend` |
| 100 | `auth` ↔ `customers` |

### TOP trójki
| Zmiany | Trójka |
|---|---|
| 21 | `customers` + `sales` + `ui/backend` |
| 18 | `attachments` + `catalog` + `sales` |
| 15 | `customers` + `shared/lib` + `ui/backend` |
| 13 | `customers` + `dictionaries` + `ui/backend` |
| 13 | `catalog` + `sales` + `ui/backend` |

### Wnioski dla top 3

**`customers`** (332 commity ze sprzężeniami): 45% z `ui/backend`, 36% z `sales`, 35% z `shared/lib`, 30% z `auth`, 23% z `catalog`, ~19% z `dictionaries`/`.ai/specs`/`entities`.
→ Nie jest izolowany — niemal co druga zmiana niesie też update frameworka UI. Wysoka korelacja z `auth` (uprawnienia) i `dictionaries` (custom fields/słowniki).

**`ui/backend`** (419 commitów — najwyższa liczba spośród wszystkich modułów = "hub"): 36% `customers`, 27% `sales`, 25% `shared/lib`, 22% `auth`, ~18-19% `catalog`/`example`/`entities`, 15% `create-app`.
→ Realny rdzeń platformy — żadna zmiana CRUD/UI nie powstaje bez tej warstwy. Sprzężenie z `example` (18,6%) sugeruje, że zmiany od razu trafiają do modułu-wzorca dla developerów zewnętrznych.

**`sales`** (256 commitów — najwyższy % sprzężeń względnych z top-3): 47% `catalog`, 47% `customers`, 44% `ui/backend`, 31% `shared/lib`, 27% `auth`, ~19% `.ai/specs`/`attachments`, 17% `entities`.
→ Moduł integrujący — łączy dane z `catalog` (produkty w zamówieniach) i `customers` (klient zamówienia). Trójka `attachments+catalog+sales` (18) = powtarzalny wzorzec pracy nad dokumentami/załącznikami zamówień.

### Ogólna obserwacja
`ui/backend` spina `customers`, `sales`, `catalog`, `auth` w jeden klaster — typowy obraz frameworka z modułami CRUD rozwijanymi równolegle z komponentami współdzielonymi. Częste współwystępowanie z `.ai/specs` (17-20% u top-3) potwierdza realne stosowanie procesu spec-first.

## 5. "Wspólny mianownik" repo — pliki-rejestry (switchboard)

Poza oczywistym szumem repo-wide (`package.json`, `yarn.lock`, `AGENTS.md`, `README.md`, `.gitignore`, `.github/workflows/ci.yml` — touchowane przy ~każdej zmianie wersji/zależności/dokumentacji), istnieje wyraźna grupa **plików-rejestrów**, które trzeba zaktualizować przy *każdej* nowej funkcjonalności niezależnie od domeny:

| Plik | Distinct moduły | Commity |
|---|---|---|
| `packages/shared/src/modules/registry.ts` | 239 | 45 |
| `apps/mercato/src/modules.ts` | 234 | 41 |
| `packages/cli/src/lib/generators/module-registry.ts` | 219 | 46 |
| `apps/docs/sidebars.ts` | 227 | 43 |
| `apps/mercato/src/i18n/{en,pl,es,de}.json` | 215 | 56 (każdy) |
| `packages/core/src/modules/auth/api/admin/nav.ts` | 208 | 29 |

**Interpretacja**: dodanie/zmiana niemal dowolnego modułu pociąga rejestrację w 4-6 plikach centralnych — liście włączonych modułów (`modules.ts`), rejestrze generowanym (`module-registry.ts` → `registry.ts`), nawigacji adminowej (`auth/api/admin/nav.ts`), sidebarze docs oraz globalnych tłumaczeniach aplikacji (`apps/mercato/src/i18n/*.json`, różne od per-modułowych i18n). To realny "switchboard" architektoniczny — zestaw plików-rejestrów aktualizowanych m.in. przez `yarn generate`.

## 6. Zastrzeżenie: przeniesione pliki

Wszystkie analizowane pliki (top 10 + rejestry z sekcji 5) nadal istnieją pod tymi samymi ścieżkami (`git ls-files` OK), **z jednym wyjątkiem**:

- `src/app/(backend)/backend/layout.tsx` (top plik Q1, 44 zmiany) został **usunięty** w commicie `03b1a6c5a "feat: migration to monorepo (#320)"` (2026-01-16) i przeniesiony do:
  - `apps/mercato/src/app/(backend)/backend/layout.tsx`
  - `packages/create-app/template/src/app/(backend)/backend/layout.tsx`

To wyjaśnia, dlaczego plik dominował tylko w Q1 — po migracji do monorepo (połowa stycznia 2026) jego historia "rozdzieliła się" na dwie nowe ścieżki. Pełny obraz aktywności wymagałby zsumowania zmian z obu nowych lokalizacji.
