# Artefakt 3 — Kluczowi kontrybutorzy per obszar ryzyka (ostatnie 12 mies.)

> Wygenerowano: 2026-06-11. Zakres: `git log --since="12 months ago" --no-merges`, dla 5 obszarów zidentyfikowanych w [`artifact-1-territory.md`](./artifact-1-territory.md) (aktywność/co-change) i [`artifact-2-structure.md`](./artifact-2-structure.md) (ryzyka strukturalne).
>
> Metodologia: dla każdego obszaru policzono commity per autor, odfiltrowano boty/automatyzacje (`copilot-swe-agent[bot]` — jedyny zidentyfikowany w tych ścieżkach) oraz zdeduplikowano tożsamości (ta sama osoba commitująca pod różnymi nazwami/e-mailami, np. "Piotr Karwatka"/"pkarw", "Lukasz Stasko"/"staskolukasz", "Patryk Lewczuk"/"pat-lewczuk"). Komentarze w treści commitów wskazujące na asystę agentów (Claude/Codex/Copilot, np. `Co-Authored-By:`) nie dyskwalifikują commitu, jeśli autorem jest człowiek.
>
> **Piotr Karwatka / pkarw** jest dominującym autorem we wszystkich 5 obszarach (główny maintainer/founder) i celowo pominięty w tabelach poniżej, aby pokazać *innych* ludzi, którzy mogą realnie wesprzeć dany obszar.
>
> Dla każdego kontrybutora podano dominujące tematy aktywności (na podstawie wiadomości commitów, prefiksów konwencjonalnych `feat/fix/refactor/test/docs/security/perf` i słów kluczowych) wraz z przykładowym commitem.

## 1. Kernel SCC (`packages/shared/src/lib/{crud,di,auth,commands}`)

| Kontrybutor | Commity (12 mies.) | Dominujące tematy |
|---|---|---|
| Maciej Dudziak | 11 | Features/CRM-CRUD: *"feat: SPEC-046a/b – customers v2 (#1050)"* / Refaktoryzacja: *"feat: SPEC051 deduplication sonarqube safe phase 1 (#813)"* |
| Patryk Lewczuk | 8 | Security: *"security(shared/auth): fingerprint API key secrets before caching (#2717)"* / Features (extensibility): *"feat: SPEC-041m mutation lifecycle hooks (m1-m4) (#782)"*, *"feat: add customer_accounts module (SPEC-060)"* |
| pawelleszczewicz | 5 | Tests/QA: *"tests: add low-level coverage for check.ts (#1230)"*, *"...passwordPolicy.ts (#1206)"* |
| Lukasz Stasko | 4 | Refaktoryzacja/ORM: *"test: migrate 35 persistAndFlush/removeAndFlush calls to persist().flush()..."* |
| Patryk Andrzejewski | 3 | DevEx/architektura: *"feat: migration to monorepo (#320)"*, *"fix: circular dependencies → TDZ violations (#283)"* |

**Kto wesprze**: security/extensibility kernela → **Patryk Lewczuk**; pokrycie testami niskopoziomowych helperów → **pawelleszczewicz**; migracje ORM/persist-pattern → **Lukasz Stasko**.

## 2. Cross-module entity coupling (`catalog`/`sales`/`customers`/`auth`)

| Kontrybutor | Commity (12 mies.) | Dominujące tematy |
|---|---|---|
| Maciej Dudziak | 61 | Features/CRM: *"feat: sales pipeline kanban (#1949)"*, *"feat: CRM activity new UI (#1791)"* / Testy integracyjne: *"feat: 2459 sales integration coverage (#2626)"* / Security: *"security(customers): exclude-link list lookups omit tenant/org scope (#2757)"* |
| Patryk Lewczuk | 19 | Security/RBAC: *"security(auth): tenant-scope findRoleInScope DB query (#2730)"*, *"security: per-module ACL + tenant ownership (#2612)"* / Architektura: *"feat: workflow engine (#298)"*, *"feat: customer_accounts (SPEC-060)"* |
| Lukasz Stasko | 13 | ORM v7 migration: *"core: fix FilterQuery/RequiredEntityData type mismatches (v7 stage 4a)"*, *"customers: migrate knex→Kysely (v7)"* |
| Bernard van der Esch | 11 | Security/bugfixy (atomic writes, scoping): *"security(customers,shared): fail closed on org-scope checks (#2239, #2245)"*, *"fix(auth,...): atomic writes for ACL, user-delete cascade (#2339)"* |
| Sawarz | 7 | Bugfixy/QA: *"fix: qa issues"* / Features: *"feat: order returns"* |
| amtmich | 7 | Bugfixy/UI: *"fix: improve product search in sales line item dialog (#1373)"* / Refaktoryzacja: *"refactor: move default encryption maps to per-module registration (#1214)"* |

**Kto wesprze**: feature'y CRM/sales/customers + integration tests → **Maciej Dudziak**; cross-module security/RBAC/tenant-scoping → **Patryk Lewczuk** i **Bernard van der Esch**; MikroORM v6→v7 → **Lukasz Stasko**; sales/UI bugfixy → **amtmich**, **Sawarz**.

## 3. UI backend framework ↔ AI assistant coupling

| Kontrybutor | Commity (12 mies.) | Dominujące tematy |
|---|---|---|
| Maciej Dudziak | 34 | Features CRM UI: *"feat: CRM activity new UI (#1791)"* / Testy: *"Integration tests: ai_assistant — sessions, tool registration, RBAC (#2495)"* |
| Patryk Lewczuk | 22 | Security: *"security(ai_assistant): enforce Code Mode mutation cap (#2724)"*, *"security(ui): harden URL-controlled flash banner (#2721)"* / Performance: *"perf: CrudForm triggers full re-renders on every keystroke (#1407)"* / Features: portal module |
| zielivia | 12 | DS/UI rewrites: *"feat(ds): DS Foundation v5 — 12 primitives + 8 rewrites (#2322)"*, *"feat(ui): backend topbar redesign"*, *"feat(ui): two-level sidebar (#1790)"* |
| Dominik Pałatyński | 8 | Features: *"feat: messages module (#569)"*, *"feat: typed feature toggles (#300)"* |
| Michal (mgc-studio) | 7 | i18n: tłumaczenia DataTable/CrudForm/FilterOverlay/FilterBar |
| Muhammad Usman | 6 | Bugfixy UI: *"fix(ui): prevent duplicate custom fields in CrudForm (#1113)"* / Features: *"feat(entities): date/datetime custom field kinds (#1172)"* |

**Kto wesprze**: ai_assistant security/Code Mode i performance CrudForm → **Patryk Lewczuk**; DS/primitive'y, topbar/sidebar architektura → **zielivia**; CRM UI + ai_assistant integration tests → **Maciej Dudziak**; i18n UI → **Michal (mgc-studio)**; messages/feature toggles → **Dominik Pałatyński**.

## 4. `customer_accounts` admin API (hand-rolled routes)

| Kontrybutor | Commity (12 mies.) | Dominujące tematy |
|---|---|---|
| Patryk Lewczuk | 23 | Architektura (właściciel modułu): *"feat: add customer_accounts module (SPEC-060)"*, *"feat: portal module with extensible dashboard..."* / Security: *"security(customer_accounts): close login account-enumeration timing/error oracle (#2694)"*, *"...rate-limit and dedupe customer invitations (#2692)"* / Refaktoryzacja: *"restructure customer_accounts API routes from verb-directory to flat pattern"* |
| Lukasz Stasko | 5 | ORM: *"Take advantage of persist()/flush() syntax"*, *"Migrate to @mikro-orm/decorators/legacy"* |
| MarekUrzon | 4 | Security/auth: *"fix(security): revoke customer sessions after admin password reset (#1223)"*, *"fix(auth): reject customer JWTs issued before session revocation"* |
| WH173-P0NY | 5 | Security: *"fix(security): revoke customer sessions on self-service password change (#1686)"*, *"Fix/security customer signup tenant binding (#1584)"*, *"re-resolve customer portal ACL on every request (#1316)"* |
| Maciej Dudziak | 3 | Testy integracyjne: *"customer portal API coverage — profile, users, sessions, roles, feature-check (#2463)"* |
| zielivia | 3 | DS/UI: *"feat(ui): standardize list empty states (#772)"*, DS Foundation v2 |

**Kto wesprze**: **Patryk Lewczuk** to faktyczny właściciel modułu — pierwszy kontakt przy każdej zmianie architektury/kontraktu; sesje/security portalu klienta → też **WH173-P0NY** i **MarekUrzon**; luki w pokryciu testami → **Maciej Dudziak**.

## 5. Silnik `workflows`

| Kontrybutor | Commity (12 mies.) | Dominujące tematy |
|---|---|---|
| Patryk Lewczuk | 11 | Architektura (autor silnika): *"feat: workflow engine (#298)"*, *"feat: workflow engine enhancements (#394)"* / Reliability: *"fix: Workflow activity timeouts don't abort underlying work — phantom executions (#1417)"* / Security: *"fix(security): pin outbound webhook DNS to defeat DNS rebinding/SSRF (#1735)"* |
| Lukasz Stasko | 6 | ORM v7: *"auth+workflows+business_rules: drop persistAndFlush from test mocks (v7)"* |
| Maciej Dudziak | 5 | Testy integracyjne: *"workflows coverage — user tasks, signals, retry/advance, RBAC, tenant scoping (#2462)"* |
| Jacek Tomaszewski | 5 | Bugfixy/reliability: *"fix(workflows): halt workflow on activity failure by default"*, *"fix: prevent column truncation on definitions list (#1623)"* / Testy: e2e UI tests |
| Bernard van der Esch | 3 | Architektura: *"feat(workflows): PARALLEL_FORK / PARALLEL_JOIN engine support (#2428)"*, *"feat(workflows): declare ACL feature dependencies (#2150)"* |
| Marynat | 3 | Testy/specs: *"test(workflows): integration tests for definition/instance lifecycle (#622)"* |
| Wiktor Idzikowski | 3 | Concurrency: *"fix(workflows): serialize workflow instance execution (#1391)"* |

**Kto wesprze**: **Patryk Lewczuk** — oryginalny architekt silnika (semantyka, security/reliability aktywności); rozszerzenia modelu wykonania (parallel/compensation) → **Bernard van der Esch**; bugfixy halt/failure + e2e → **Jacek Tomaszewski**; concurrency/serializacja → **Wiktor Idzikowski**.

## 6. Wnioski przekrojowe

- **Patryk Lewczuk** powtarza się jako kluczowy kontakt w 4/5 obszarów (security/RBAC kernela, customer_accounts jako *owner*, workflows jako autor silnika, ai_assistant security) — najbardziej "krytyczny pojedynczy punkt wiedzy" poza Piotrem Karwatką.
- **Maciej Dudziak** dominuje w obszarze 2 (61 commitów) — głównie CRM/sales/customers feature-development + testy integracyjne; naturalny kontakt dla zmian domenowych w `customers`/`sales`.
- **Lukasz Stasko** to wspólny mianownik migracji MikroORM v6→v7 w obszarach 1, 2, 4, 5 — wartościowy przy każdej zmianie dotykającej wzorców persist/flush.
- **Bernard van der Esch** koncentruje się na security/atomicity (org-scope, ACL) oraz rozszerzeniach silnika workflows — dobry kandydat do code review zmian dot. tenant isolation.
- Security-fixe (np. #1316/#1584/#1686/#2239/#2694/#2717/#2730) są rozproszone między Patryka Lewczuka, Bernarda van der Escha, MarekaUrzona i WH173-P0NY — może warto rozważyć nieformalny "security review" krąg z tych osób dla zmian w obszarach 1, 2 i 4.
