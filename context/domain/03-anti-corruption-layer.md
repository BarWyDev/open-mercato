---
title: Warstwa antykorupcyjna — izolacja MikroORM za portem repozytorium
created: 2026-06-21
type: refactor-plan
---

# ACL: MikroORM przecieka przez wszystkie warstwy domeny

> Produkt to PLAN refaktoru, nie implementacja. Prompt: `m4l5-3-anti-corruption-layer`.
> Cytuję wyłącznie zweryfikowane plik:linia.

## Krok 0 — Kontekst

- Zależności zewnętrzne (manifest): `@mikro-orm/core` + `@mikro-orm/decorators/legacy`
  (persystencja), `stripe` (płatności), `@aws-sdk` (`storage-s3`), AI SDK (`ai-assistant`),
  klienci kanałów (`channel-gmail/imap`), `sync-akeneo`.
- **Sygnał intencji wymienialności**: istnieje dedykowana skill migracyjna
  `.ai/skills/om-migrate-mikro-orm/SKILL.md` (v6→v7) — zespół *realnie* wymienia wersję ORM,
  więc koszt przecieku jest namacalny. AGENTS.md dodatkowo nakłada obowiązkowe *opakowania*
  ORM (`findWithDecryption`, `withAtomicFlush`) — to przyznanie, że surowy `em` jest niebezpieczny.

## Krok 1 — Identyfikacja przecieków

| Zależność | Pliki, które ją „znają" | Sygnał przecieku |
|---|---|---|
| **`@mikro-orm/*`** | **~626 plików** w `packages/core/src/modules` + `apps/mercato/src` (`grep -rln "@mikro-orm/core\|@mikro-orm/postgresql"`) | typy biblioteki w sygnaturach domenowych (`EntityManager` przekazywany do command/serwisów), **dekoratory biblioteki NA encjach domenowych** (`entities.ts:1-2`: `Collection`/`OptionalProps` z `@mikro-orm/core`, `@Entity`/`@ManyToOne` z `@mikro-orm/decorators/legacy`) |
| `stripe` | **3 pliki src** (`gateway-stripe/.../lib/client.ts`, `lib/health.ts`, `lib/webhook-handler.ts`) | **brak przecieku** — patrz Krok 2 (referencja pozytywna) |

**Wynik**: dwa skrajne przypadki. `stripe` jest **wzorcowo odizolowany**; `@mikro-orm`
przecieka maksymalnie — jest w warstwie persystencji, aplikacji (command/serwis) **oraz w
samej domenie** (encje są zdefiniowane dekoratorami ORM).

## Krok 2 — Klasyfikacja i wybór #1

| Oś | `@mikro-orm` | `stripe` |
|---|---|---|
| (a) liczba warstw/plików | ~626, wszystkie warstwy | 3, tylko adapter |
| (b) koszt wymiany dziś | wysoki (cała persystencja + encje) | niski (adapter) |
| (c) intencja-vs-kod | **silna** (skill migracji v6→v7, wymuszone opakowania) | brak rozjazdu |

**Wybór: `@mikro-orm` jako najgorszy przeciek.** `stripe` służy jako **referencja docelowego
wzorca** ACL, którego MikroORM nie ma:

- `gateway-stripe` ma katalog `lib/adapters/` z wersjonowanymi adapterami API
  (`v2023-10-16.ts`, `v2024-12-18.ts`, `v2025-02-24.acacia.ts`) — kształt zależności żyje w
  jednym miejscu.
- Ma **testy izolacji**: `__tests__/payments-client-pure-import.test.ts` (pilnuje, by `stripe`
  nie trafił do bundla klienta) i `__tests__/acl-dependencies.test.ts`. To dokładnie kryterium
  sukcesu, którego dla ORM nie ma.

## Krok 3 — Diagnoza (MikroORM)

- **Przeciek typów do domeny**: command `createPaymentCommand` przyjmuje i operuje na
  `EntityManager` (`payments.ts:336` `ctx.container.resolve('em') as EntityManager`,
  `tx.create(SalesPayment, …)` `:405`, `findOneWithDecryption(tx, SalesOrder, …, { lockMode: LockMode.PESSIMISTIC_WRITE })` `:343-344`). Logika domenowa zna API biblioteki (transakcje,
  lock modes, `getReference`).
- **Przeciek dekoratorów na encjach** (najgroźniejszy): `sales/data/entities.ts:1-2` —
  model domenowy *jest* modelem MikroORM. Nie da się dziś zbudować agregatu `Order`
  (artefakt 02) bez wciągnięcia ORM do domeny.
- **Duplikacja wiedzy o kształcie**: 626 plików samodzielnie wie, jak ładować/zapisywać encje
  (rozsiane `em.find`/`em.create`/`em.transactional`), zamiast jednego repozytorium na agregat.
- **Częściowe ACL już istnieje, ale nieszczelne**: `findWithDecryption`/`withAtomicFlush`
  opakowują *część* operacji `em`, ale nie ukrywają samego `EntityManager` ani typów encji —
  to plaster, nie port.

## Krok 4 — Projekt ACL (port + adapter), zakres: agregat `Order`

Pełne usunięcie MikroORM z 626 plików jest nierealne — i niezgodne z duchem promptu (wąski
port). Projektuję **ACL scoped do agregatu `Order`** z artefaktu 02; ten sam wzorzec jest potem
powtarzalny per-agregat.

```typescript
// domena — WĄSKI port, zna tylko pojęcia domenowe (zero MikroORM)
interface OrderRepository {
  load(id: OrderId, scope: Scope): Promise<Order | null>     // ładuje cały agregat
  save(order: Order): Promise<void>                          // zapisuje atomowo
}

// adapter — JEDYNE miejsce wiedzy o MikroORM dla tego agregatu
class MikroOrmOrderRepository implements OrderRepository {
  constructor(private readonly em: EntityManager) {}
  async load(id, scope) {
    return this.em.transactional(async (tx) => {
      const row = await findOneWithDecryption(tx, SalesOrder, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
      return row ? toDomain(row, /* payments, allocations */) : null   // mapowanie ORM→domena
    })
  }
  async save(order) { /* mapowanie domena→ORM + withAtomicFlush w jednej transakcji */ }
}
```

- **Value object / mapper** (`toDomain`/`toPersistence`) jest jedynym miejscem konwersji
  encja ORM ↔ agregat domenowy. Reszta kodu (command, route) zna tylko `OrderRepository` i
  `Order`.
- **Adapter wstrzykiwany przez DI** (jak istniejące porty infrastruktury: `cache`/`queue`/
  `storage` są już resolvowane z kontenera) — `container.register({ orderRepository: … })`.
- **Otwarte pytania kontraktowe** (lock mode, populacja kolekcji) rozstrzygane w adapterze,
  nie w warstwie API — zgodnie z zasadą „decyzja w ACL".

## Krok 5 — Dowód izolacji + before/after

**Before/after (na ścieżce płatności):**

| Dziś | Po |
|---|---|
| `createPaymentCommand` zna `EntityManager`, `tx.create`, `LockMode` (`payments.ts:336-405`) | command zna tylko `orderRepository.load/save` + agregat |
| `outstanding` clampowany w command (`payments.ts:316`) | reguła w agregacie (artefakt 02), persystencja w adapterze |
| wiedza o ładowaniu ordera rozsiana | jedno `MikroOrmOrderRepository` |

**Kryterium sukcesu (mierzalne, wzorem `gateway-stripe`):**
`grep -rn "SalesOrder\|EntityManager\|LockMode" <command-surface order>` zwraca **wyłącznie**
plik adaptera repozytorium — nie command, nie route. Plus test à la
`acl-dependencies.test.ts`, który tego pilnuje dla agregatu `Order`.

**Pliki, które dziś znają ORM na ścieżce order/payment, a po refaktorze już NIE:**
`sales/commands/payments.ts` (przestaje importować `EntityManager`/`SalesOrder`/`LockMode`),
ewentualne route'y `api/sales/payments/*`. ORM zostaje w: nowym `MikroOrmOrderRepository`
+ `data/entities.ts` (definicja tabel — to dopuszczalna granica persystencji).

**Plan faz** (zgodny z konwencją: command pattern + test-first):
1. (test) test izolacji `acl-dependencies` dla agregatu `Order` (czerwony dziś).
2. `OrderRepository` port + `MikroOrmOrderRepository` adapter + mapper, zarejestrowany w DI.
3. Przepnij `createPaymentCommand` na port (zazębia się z fazą 3 artefaktu 02).
4. Powtórz wzorzec dla kolejnych komend `sales` (returns/shipments) — osobne PR-y.

## Podsumowanie

Najgorszym przeciekiem zależności w repo jest **MikroORM**: żyje w ~626 plikach, jego typy
(`EntityManager`, `LockMode`) trafiają do sygnatur komend domenowych (`payments.ts:336-405`),
a jego dekoratory definiują *same encje domenowe* (`entities.ts:1-2`) — domena nie istnieje
bez biblioteki. Sygnał intencji-vs-kod jest mocny: istnieje skill migracji v6→v7
(`om-migrate-mikro-orm`) i wymuszone opakowania (`findWithDecryption`/`withAtomicFlush`),
czyli zespół traktuje ORM jako wymienny/niebezpieczny, ale kod tego nie domyka. Kontrastem jest
`stripe`, odizolowany wzorcowo w 3 plikach z wersjonowanymi adapterami i testami izolacji —
to docelowy wzorzec ACL. Projekt naprawy to **wąski `OrderRepository` (port) + `MikroOrmOrderRepository`
(adapter)** scoped do agregatu `Order` z artefaktu 02, z mapperem jako jedynym miejscem konwersji
ORM↔domena i adapterem wstrzykiwanym przez DI (jak istniejące porty cache/queue/storage). Kryterium
sukcesu jest mierzalne wzorem `gateway-stripe/acl-dependencies.test.ts`: grep po typach ORM na
powierzchni komendy order/payment ma zwracać wyłącznie adapter. Pełne usunięcie ORM jest poza
zakresem — ACL jest celowo wąski i powtarzalny per-agregat.
