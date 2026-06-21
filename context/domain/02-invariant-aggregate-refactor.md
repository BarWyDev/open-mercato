---
title: Refaktor agregatu-strażnika — zakaz cichej nadpłaty na SalesOrder
created: 2026-06-21
type: refactor-plan
---

# Niezmiennik #1: SalesOrder nie przyjmuje cichej nadpłaty

> Produkt to PLAN refaktoru, nie implementacja. Prompt: `m4l5-2-invariant-aggregate-refactor`.
> Fail-fast: nielegalna operacja zatrzymuje, nie loguje-i-jedzie. Cytuję zweryfikowane plik:linia.

## Krok 0 — Kontekst

- Stack: MikroORM v7 + Postgres, DI (Awilix), zapisy przez **Command pattern**
  (`CommandHandler`, audyt/undo/cache/events). Brak `prd.md` — źródło reguł to
  `sales/AGENTS.md` + kod.
- Warstwy logiki sprzedaży: route (`api/sales/payments`) → command
  (`sales/commands/payments.ts`) → encje (`data/entities.ts`) → math
  (`services/salesCalculationService` + `lib/calculations.ts`).

## Krok 1 — Zidentyfikowane niezmienniki (z dokumentów + kodu)

1. **Σ płatności (allocations) ≤ grandTotal zamówienia** — nie istnieje „ujemny dług";
   nadpłata jest błędem biznesowym. Wyprowadzony z istnienia `outstanding` i jego clampu:
   `payments.ts:316`.
2. grandTotal = f(lines, adjustments, tax), liczone JEDYNIE przez `salesCalculationService`
   — `sales/AGENTS.md` „Never reimplement document math inline".
3. Waluta płatności = waluta zamówienia — egzekwowane `payments.ts:351-359`.
4. Order ma kanał i ≥1 linię — `sales/AGENTS.md` (§ Data Model Constraints).
5. Quote→Order→Invoice bez skoków — `sales/AGENTS.md` (§ Document Flow).

## Krok 2 — Klasyfikacja i wybór #1

| Niezmiennik | (a) rdzeniowość | (b) rozsmarowanie | (c) egzekucja | Wynik |
|---|---|---|---|---|
| **#1 nadpłata** | **wysoka** (pieniądze) | math w `lib/calculations.ts`, recompute w `payments.ts`, status w `seed/examples.ts:1234` | **naruszalny** (clamp do 0) | **WYBÓR** |
| #2 math service | wysoka | services + lib | deklarowany | — |
| #3 waluta | średnia | 1 miejsce | egzekwowany | — |
| #4 kanał+linia | średnia | validators | deklarowany | — |
| #5 flow | wysoka | documents.ts | konfigurowalny | — |

**Wybór: #1 (zakaz cichej nadpłaty)** — jednocześnie najbardziej rdzeniowy (dotyka rozliczeń)
**i** najsłabiej egzekwowany. To także naruszenie #2: logika rozliczeniowa siedzi w
`payments.ts`, poza `salesCalculationService`, więc „jedyne miejsce matematyki" go nie obejmuje.

## Krok 3 — Diagnoza wybranego niezmiennika

Gdzie dziś żyje reguła (i gdzie jej brak):

- **Recompute, NIE guard** — `recomputeOrderPaymentTotals` (`payments.ts:251-325`):
  ```
  const grandTotal   = toNumber(order.grandTotalGrossAmount)        // :315
  const outstanding  = Math.max(grandTotal - paidTotal + refundedTotal, 0)  // :316
  order.outstandingAmount = toNumericString(outstanding) ?? '0'     // :319
  ```
  `Math.max(..., 0)` **połyka** nadpłatę: gdy `paid > grandTotal`, `outstanding` = 0,
  a nadwyżka znika z modelu zamiast zatrzymać operację.
- **Brak preconditiona w command** — `createPaymentCommand` (`payments.ts:327-434`)
  sprawdza scope (`:334-335`), istnienie ordera (`:343`), zgodność waluty (`:351-359`),
  ale **nie ma** żadnego sprawdzenia `amount ≤ outstanding`. Płatność tworzona
  bezwarunkowo (`tx.create(SalesPayment, …)` `:405`).
- **Brak twardego śladu reguły gdziekolwiek** — `grep` po `exceed|overpay|> outstanding`
  w całym `packages/core/src/modules/sales` nie zwraca żadnego guardu nadpłaty
  (jedyny hit to etykieta statusu w seedzie, `seed/examples.ts:1234`).
- **Klient nie jest nawet strażnikiem** — to nie jest „walidacja tylko na UI";
  reguły nie ma na żadnej warstwie. Brak też dedykowanego testu nadpłaty
  (`commands/__tests__/payments.test.ts` testuje happy-path/scope, nie nadpłatę).

Wniosek: niezmiennik jest naruszalny **na każdej warstwie**, a błąd jest „połykany"
(clamp), nie zgłaszany.

## Krok 4 — Projekt agregatu-strażnika

Agregat: **`Order` (root)** — JEDYNE miejsce egzekwujące reguły rozliczeniowe. Persystencja
przez repozytorium (port — patrz `03-anti-corruption-layer.md`). Metody domenowe z
preconditions; nielegalna operacja rzuca **nazwany błąd domenowy**, nie aktualizuje cicho.

```typescript
// domena (czysta, bez MikroORM)
class OverpaymentError extends DomainError {            // nazwany błąd → 400/409
  constructor(readonly orderId: string, readonly attempted: Money, readonly outstanding: Money) { super() }
}

class Order {
  // niezmiennik trzymany w jednym miejscu
  private get outstanding(): Money { return this.grandTotal.minus(this.paid).plus(this.refunded) }

  registerPayment(amount: Money, opts: { allowOverpay?: boolean } = {}): Payment {
    if (amount.currency !== this.currency) throw new CurrencyMismatchError(this.id)
    if (!opts.allowOverpay && amount.gt(this.outstanding)) {
      throw new OverpaymentError(this.id, amount, this.outstanding)   // FAIL-FAST
    }
    const payment = Payment.create(this.id, amount)
    this.payments.push(payment)
    this.recomputeTotals()        // bez clampu — outstanding może wynikowo zejść do 0 legalnie
    return payment
  }
}
```

- **Repozytorium** ładuje/zapisuje cały agregat (order + payments + allocations) zamiast
  rozsianych `tx.findOne`/`tx.create` — dziś rozproszonych po `payments.ts`. Atomowość już
  jest zapewniona (`em.transactional` + `LockMode.PESSIMISTIC_WRITE` `payments.ts:342-344`) —
  agregat wykonuje się w TEJ SAMEJ transakcji.
- **Cienki command/route**: `createPaymentCommand` → parse wejścia (zod) → `order.registerPayment(...)`
  → `repo.save(order)` → mapowanie `OverpaymentError` na `CrudHttpError(409, …)`. Egzekucja
  przenosi się z „nigdzie" na serwer/agregat.
- **`salesCalculationService`** pozostaje właścicielem matematyki pozycji/totali; agregat woła
  go do `recomputeTotals()` — to domyka rozjazd D4 (math w jednym miejscu).
- **Opt-out świadomy**: `allowOverpay: true` zostaje jako jawna decyzja (np. zaliczki/depozyty),
  ale domyślnie nadpłata jest odrzucana — nie odwrotnie.

## Krok 5 — Before/after, plan, testy

**Before/after (każde dzisiejsze miejsce reguły):**

| Miejsce dziś | Before | After |
|---|---|---|
| `payments.ts:316` | `Math.max(grandTotal − paid + refunded, 0)` (clamp połyka nadpłatę) | `recomputeTotals()` w agregacie; nadpłata niemożliwa, więc clamp zbędny |
| `payments.ts:327-434` | command tworzy płatność bez sprawdzenia kwoty | command deleguje do `order.registerPayment()`, mapuje `OverpaymentError`→409 |
| (brak) | reguła nieobecna na każdej warstwie | reguła w JEDNYM miejscu (agregat) |

**Plan faz (projekt ma dyscyplinę test-first — `commands/__tests__/` istnieje):**

1. **(test-first)** Dopisz testy niezmiennika do `payments.test.ts`: (a) płatność = outstanding → OK;
   (b) płatność > outstanding → `OverpaymentError`/409; (c) `allowOverpay` → OK; (d) suma kilku
   allocations > grandTotal → odrzucenie. **Czerwone** na obecnym kodzie.
2. Wyodrębnij regułę jako czystą funkcję domenową `assertNoOverpayment(order, amount)` wołaną w
   `createPaymentCommand` przed `tx.create` — najmniejszy krok, zazielenia testy bez przepisywania
   persystencji. (Reuse istniejącego `enforceCommandOptimisticLock`/seam komendowego jako wzorca
   miejsca wstrzyknięcia guardu.)
3. Wprowadź `Order` agregat + `OrderRepository` port (zazębia się z `03-anti-corruption-layer.md`),
   przenieś `registerPayment`/`recomputeTotals` do agregatu, command staje się cienki.
4. Powtórz dla ścieżek pochodnych: `payments` (refund), `returns.ts`, `documents.ts` (jeśli dotykają
   totali) — każda jako osobny PR.

**Nowe „load-bearing" nazwy do rejestru kontraktów** (`BACKWARD_COMPATIBILITY.md`):
`OverpaymentError`, `Order.registerPayment`, `OrderRepository` (DI key), kod błędu HTTP 409 nadpłaty.

## Podsumowanie

Wybrany niezmiennik — **zakaz cichej nadpłaty na zamówieniu** — jest rdzeniowy (dotyka pieniędzy)
i dziś naruszalny na każdej warstwie: `recomputeOrderPaymentTotals` clampuje `outstanding` do zera
(`payments.ts:316`), a `createPaymentCommand` tworzy płatność bez sprawdzenia kwoty
(`payments.ts:327-434`). Reguły nie ma nigdzie indziej — `grep` po nadpłacie w całym module
`sales` nie zwraca guardu, a logika rozliczeniowa żyje poza `salesCalculationService` wbrew
deklaracji modułu. Projekt naprawy to agregat `Order` jako jedyny strażnik: `registerPayment()`
z preconditionem rzucającym `OverpaymentError` (fail-fast), persystencja przez repozytorium w
istniejącej już transakcji z pessimistic lock. Plan jest test-first (cztery przypadki niezmiennika),
z najmniejszym pierwszym krokiem (czysta funkcja-guard w command), a docelowy agregat zazębia się
z warstwą antykorupcyjną z artefaktu 03. Najważniejszy wniosek: błąd jest dziś *połykany* przez
`Math.max(...,0)`, więc nadpłata znika z modelu zamiast zatrzymać operację — to klasyczny rozjazd
„kod loguje-i-jedzie" zamiast egzekwować regułę domenową.
