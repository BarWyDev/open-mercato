# Refactor Opportunities — First Steps (C1, C4, C5) Implementation Plan

## Overview

Implements the three highest-ranked "first step" refactors from `research.md`:
1. **C1** — a shared, encryption-aware `CustomerUserSummary` DTO + loader in `customers/lib/`, migrating the deprecated `activities` route off a direct `customers → auth` ORM import.
2. **C4** — extracting the inline custom-fields load/merge/normalize block from the 1203-line `people/[id]` GET route into a named, independently-testable helper.
3. **C5** — extracting the optimistic-lock-aware update/delete handlers from the `people-v2/[id]` detail page into a page-local hook, mirroring the existing `useDealFormHandlers` precedent, with a characterization test.

Each phase is independent (different module areas: `customers/lib`, `customers/api/people/[id]`, `customers/backend/customers/people-v2`) and can land as a separate PR.

## Current State Analysis

**C1**: 7 files under `customers/api/**` import `User` from `auth/data/entities` directly. `activities/route.ts`'s `decorateActivityItems()` (lines 190-250) calls `em.find(User, { id: { $in: authorIds } })` and builds `userMap = new Map(users.map(u => [u.id, { name: u.name ?? null, email: u.email ?? null }]))`. `User.email`/`User.name` are registered as encrypted fields (`packages/core/src/modules/auth/encryption.ts`), so plain `em.find` returns ciphertext for these fields. `customers/lib/interactionReadModel.ts` already solves the identical author-lookup problem correctly via `findWithDecryption(em, User, { id: { $in: authorIds } }, undefined, { tenantId, organizationId })`.

**C4**: `customers/api/people/[id]/route.ts` GET handler is 1203 lines, hand-rolled (no `makeCrudRoute`), with zero unit tests on the main handler. Lines 679-716 inline: load entity-level custom fields → load profile-level custom fields (if a profile exists) → resolve person custom-field routing → merge → normalize, with 4 `profiler.mark(...)` calls interleaved. The file already has an established pattern for this kind of extraction: `resolveTodoDetails(queryEngine, links, tenantId, organizationIds, profiler?)` (line 235) — a locally-defined async helper taking an optional `profiler?: RouteProfiler` and calling `profiler?.mark(...)` internally. `RouteProfiler` (line 154) is a file-local type, not exported.

**C5**: `customers/backend/customers/people-v2/[id]/page.tsx` has exactly 2 `buildOptimisticLockHeader` call sites: `handleFormSubmit` (update, lines 338-381, header built at 364-367) and `handleFormDelete` (delete, lines 383-421, header built at 396-401), plus `handleHeaderSave` (423-426) and the `isSaving` state. `customers/backend/customers/deals/[id]/hooks/useDealFormHandlers.ts` + its companion `useDealFormHandlers.optimisticLock.test.tsx` already solved the same problem for the deals detail page and is a near-complete template (signature shape, file location under `[id]/hooks/`, RTL `renderHook` test mocking `updateCrud`/`deleteCrud`/`withScopedApiRequestHeaders`/`flash`/`useConfirmDialog`/`next/navigation`/`useT`). The existing test `people-v2/[id]/__tests__/page.test.tsx` ("sends the optimistic-lock header on person delete (PR #2055 QA)", lines 181-217) must remain green after extraction.

## Desired End State

- A new `customers/lib/customerUserSummary.ts` module exports `CustomerUserSummary` and `loadCustomerUserSummaries()`; `activities/route.ts` no longer imports `User` from `auth/data/entities`, and `decorateActivityItems()` returns decrypted `authorName`/`authorEmail` via the new loader.
- `people/[id]/route.ts` has a new local helper `loadPersonDetailCustomFields()` (mirroring `resolveTodoDetails`'s shape) that owns the custom-fields load/merge/normalize logic; the GET handler's `customFields` response field is unchanged in shape and content.
- `people-v2/[id]/page.tsx` delegates its form-submit/delete/header-save handlers to a new `usePersonGuardedMutation()` hook in `[id]/hooks/`; the page component shrinks, and the existing PR #2055 delete-header test and a new hook-level characterization test both pass.

Verification: `yarn build:packages`, `yarn typecheck`, `yarn lint`, and `yarn test` (scoped to `packages/core/src/modules/customers`) all pass; the new/extracted units have their own tests as described per phase below.

### Key Discoveries:

- `customers/lib/interactionReadModel.ts:149-170` — the `findWithDecryption` + `userMap` pattern C1's loader should mirror.
- `customers/api/activities/route.ts:220,232-247` — exact `em.find`/`userMap` block C1 replaces; `decryptionScope?: { tenantId, organizationId }` is already a parameter of `decorateActivityItems`.
- `packages/core/src/modules/auth/encryption.ts:5-9` — confirms `User.email`/`User.name` are encrypted fields; current `em.find` usage in `activities/route.ts` returns ciphertext.
- `customers/api/people/[id]/route.ts:235-294` (`resolveTodoDetails`) — the precedent shape for C4's `loadPersonDetailCustomFields` (local helper, optional `profiler?: RouteProfiler`, `RouteProfiler` type defined at line 154).
- `customers/api/people/[id]/route.ts:679-716` — exact block C4 extracts.
- `customers/backend/customers/deals/[id]/hooks/useDealFormHandlers.ts` + `useDealFormHandlers.optimisticLock.test.tsx` — the template for C5's hook + test.
- `customers/backend/customers/people-v2/[id]/page.tsx:75-79,98-113,199-219,315,338-426` — all state/refs/callbacks C5's hook needs as inputs (`dataRef`, `mutationContextId`/`runMutationWithContext`, `tagsSectionControllerRef`, `formWrapperRef`, `handleFormSubmit`/`handleFormDelete`/`handleHeaderSave`).
- `customers/backend/customers/people-v2/[id]/__tests__/page.test.tsx:181-217` — existing PR #2055 delete-header test that must keep passing.

## What We're NOT Doing

- C2 (kernel SCC), C3 (hand-wired optimistic-lock readers), C6 (`PersonCard` ↔ `CompanyPeopleSection` cycle) — per research's recommendation, these stay as test-debt backlog / boy-scout items, not structural refactors in this change.
- Migrating the other 6 files that import `User` from `auth/data/entities` (`interactions/route.ts`, `entity-roles-factory.ts`, `companies/[id]/route.ts`, `deals/[id]/route.ts`, `people/[id]/route.ts`) — only `activities/route.ts` migrates in this "first step."
- The dead `RESOURCE_KIND_PEOPLE` code in `customers/di.ts` and the duplicate `CompanyPersonSummary` type in `formConfig.tsx` — explicitly deferred to a separate change.
- Adding a full-route integration test for `GET /api/customers/people/[id]` — C4's test targets the new extracted helper in isolation, not the whole 1203-line handler.
- Extracting `runMutationWithContext`/`injectionContext` into a separate `usePersonMutationContext` hook (the analogous `useDealMutationContext` exists in deals but is not required here) — `usePersonGuardedMutation` simply receives `runMutationWithContext` as a parameter, same as `useDealFormHandlers` does.
- Any change to the `customFields` response shape, the optimistic-lock header contract, or any other public API/route contract.

## Implementation Approach

Each phase follows an existing in-repo precedent exactly, minimizing design risk:
- C1 mirrors `interactionReadModel.ts`'s `findWithDecryption`-based summary loader.
- C4 mirrors `resolveTodoDetails`'s locally-defined-helper-with-optional-profiler shape.
- C5 mirrors `useDealFormHandlers` + its `optimisticLock.test.tsx`.

Phases are ordered C1 → C4 → C5 (matching research's ranking) but have no inter-dependencies and may be implemented/landed in any order.

## Critical Implementation Details

**Behavior correction in Phase 1 (intentional, not a regression)**: `User.email`/`User.name` are encrypted fields. The current `em.find(User, ...)` in `activities/route.ts` returns ciphertext for `authorName`/`authorEmail`. The new `loadCustomerUserSummaries()` uses `findWithDecryption`, so after migration this deprecated bridge route will return *decrypted* `authorName`/`authorEmail` — matching the behavior `interactionReadModel.ts` already provides elsewhere. Call this out explicitly in the PR description as an intentional fix riding along with the migration, not a side effect to revert.

## Phase 1: Shared `CustomerUserSummary` loader + migrate `activities/route.ts` (C1)

### Overview

Introduce a narrow, reusable DTO + loader for "author/owner name+email" lookups against `auth.User`, and migrate the one deprecated-bridge route that currently does this with a plain, non-decrypting `em.find`.

### Changes Required:

#### 1. New shared loader

**File**: `packages/core/src/modules/customers/lib/customerUserSummary.ts`

**Intent**: Export a `CustomerUserSummary` type and `loadCustomerUserSummaries()` function that loads `auth.User` rows by id and returns a `Map` keyed by user id with decrypted `name`/`email`, for use anywhere in `customers` that needs author/owner display info. Narrow to the field needs of `activities/route.ts` (id, name, email only). Empty `userIds` input returns an empty map without querying. A `userId` with no matching `User` row is simply absent from the returned map (preserving the existing `userMap.get(id)?.field ?? null` fallback at call sites — i.e. orphaned FKs continue to render `null` name/email, unchanged from today).

**Contract**:
```typescript
export type CustomerUserSummary = { id: string; name: string | null; email: string | null }

export async function loadCustomerUserSummaries(
  em: EntityManager,
  userIds: string[],
  scope?: { tenantId?: string | null; organizationId?: string | null },
): Promise<Map<string, CustomerUserSummary>>
```
Internally: `userIds.length === 0` short-circuits to `new Map()`; otherwise `findWithDecryption(em, User, { id: { $in: userIds } }, undefined, { tenantId: scope?.tenantId ?? null, organizationId: scope?.organizationId ?? null })`, mapped to `[user.id, { id: user.id, name: user.name ?? null, email: user.email ?? null }]`. Mirrors `loadCustomerSummaries`'s structure in `interactionReadModel.ts:149-170`.

#### 2. Migrate `decorateActivityItems`

**File**: `packages/core/src/modules/customers/api/activities/route.ts`

**Intent**: Replace the `em.find(User, { id: { $in: authorIds } })` call (line 220) and the inline `userMap` construction (lines 232-240) with a call to `loadCustomerUserSummaries(em, authorIds, decryptionScope)`. Remove the now-unused `import { User } from '@open-mercato/core/modules/auth/data/entities'` (line 20).

**Contract**: `decorateActivityItems`'s exported signature, return type (`ActivityItem[]`), and the `authorName`/`authorEmail` fields on each returned item are unchanged in name and shape — only the source of `authorName`/`authorEmail` values changes (now decrypted, see Critical Implementation Details). `decryptionScope?.tenantId`/`decryptionScope?.organizationId` (already a parameter) are passed straight through to `loadCustomerUserSummaries`'s `scope`.

### Success Criteria:

#### Automated Verification:

- New unit test `packages/core/src/modules/customers/lib/__tests__/customerUserSummary.test.ts` passes, covering: multiple users mapped by id with decrypted `name`/`email`; empty `userIds` returns an empty map without calling `findWithDecryption`; a `userId` with no matching row is absent from the map.
- Existing tests in `packages/core/src/modules/customers/api/activities/__tests__/` (`deal-enrichment-scope.test.ts`, `tenant-scoping.test.ts`, `merged-pagination.test.ts`) continue to pass.
- `yarn workspace @open-mercato/core build` succeeds.
- `yarn typecheck` passes (no remaining reference to `User` in `activities/route.ts`).
- `yarn lint` passes for the touched files.

#### Manual Verification:

- In dev, call `GET /api/customers/activities?...` for a person/company whose activities/comments have an `authorUserId`; confirm `authorName`/`authorEmail` in the JSON response are readable plaintext (not ciphertext) for a tenant with encryption enabled.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Extract custom-fields helper from `people/[id]/route.ts` (C4)

### Overview

Extract the inline custom-fields load/merge/normalize block into a named, locally-scoped helper following the `resolveTodoDetails` precedent, and give it its own snapshot test — the first test coverage this 1203-line route has ever had.

### Changes Required:

#### 1. Extract `loadPersonDetailCustomFields`

**File**: `packages/core/src/modules/customers/api/people/[id]/route.ts`

**Intent**: Extract lines 679-716 (entity custom-field load → profile custom-field load → routing resolution → merge → normalize, with their 4 `profiler.mark(...)` calls: `entity_custom_fields_loaded`, `profile_custom_fields_loaded`, `custom_field_routing_resolved`, `custom_fields_merged`) into a new local async function `loadPersonDetailCustomFields`, placed near `resolveTodoDetails` (line 235) and following its shape (locally-defined, optional `profiler?: RouteProfiler`, internal `profiler?.mark(...)` calls using the same labels as today). Replace the inline block at lines 679-716 with a single call assigning `customFields`.

**Contract**:
```typescript
async function loadPersonDetailCustomFields(
  em: EntityManager,
  person: CustomerEntity,
  profile: CustomerPersonProfile | null,
  tenantFallback: string | null,
  profiler?: RouteProfiler,
): Promise<Record<string, unknown>>
```
Returns exactly what the inline block currently assigns to `customFields`: `normalizeCustomerDetailCustomFields(mergePersonCustomFieldValues(routing, entityCustomFieldValues?.[person.id] ?? {}, profileId ? profileCustomFieldValues?.[profileId] ?? {} : {}))`. `tenantFallback` corresponds to `auth.tenantId` as used in the current `tenantFallbacks: [person.tenantId ?? auth.tenantId ?? null]` / `[profile?.tenantId ?? person.tenantId ?? auth.tenantId ?? null]` arrays. The GET handler's `customFields` field in the JSON response is unchanged in shape and content.

#### 2. New isolated test for the extracted helper

**File**: `packages/core/src/modules/customers/api/people/[id]/__tests__/loadPersonDetailCustomFields.test.ts`

**Intent**: Unit-test `loadPersonDetailCustomFields` in isolation (mocking `loadCustomFieldValues`, `resolvePersonCustomFieldRouting`, `mergePersonCustomFieldValues`, `normalizeCustomerDetailCustomFields` as needed) across the four input combinations: entity-only custom fields, profile-only, both, neither. For each, snapshot the full returned object via `toMatchSnapshot()` — this is the "full-response snapshot" contract test for this extraction, scoped to the new helper's return value rather than the entire GET handler (which has no test harness today and is out of scope per "What We're NOT Doing"). Commit the generated `__snapshots__/loadPersonDetailCustomFields.test.ts.snap` as the baseline.

**Contract**: 4 snapshot cases (`describe('loadPersonDetailCustomFields')` / `it.each` or 4 `it` blocks), each calling `loadPersonDetailCustomFields(...)` and asserting `toMatchSnapshot()` on the resolved value.

### Success Criteria:

#### Automated Verification:

- New test file passes and produces a committed baseline snapshot for all 4 scenarios.
- `yarn workspace @open-mercato/core build` succeeds.
- `yarn typecheck` passes.
- `yarn lint` passes for the touched files.

#### Manual Verification:

- In dev, open a person detail page (`/backend/customers/people-v2/<id>`) for a person with custom field values on both the entity and the profile; confirm the "Custom attributes" group renders the same values as before the refactor.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Extract `usePersonGuardedMutation` hook from `people-v2/[id]/page.tsx` (C5)

### Overview

Extract the form-submit/delete/header-save handlers and their `isSaving` state into a page-local hook, mirroring `useDealFormHandlers`, and add a characterization test for the optimistic-lock header wiring on both call sites.

### Changes Required:

#### 1. New hook

**File**: `packages/core/src/modules/customers/backend/customers/people-v2/[id]/hooks/usePersonGuardedMutation.ts`

**Intent**: Extract `handleFormSubmit` (lines 338-381), `handleFormDelete` (383-421), `handleHeaderSave` (423-426), and the `isSaving` state (line 85, plus its `setIsSaving` calls) into a new hook, following `useDealFormHandlers`'s shape (`UseXxxOptions` input type, `UseXxxResult` output type, same `React.useCallback` structure). Both `buildOptimisticLockHeader` + `withScopedApiRequestHeaders` call sites (update at 364-367, delete at 396-401) move with their handlers, unchanged in behavior. Import `buildPersonEditPayload`, `PersonEditFormValues`, `PersonOverview` from `../../../../../components/formConfig` (one path segment deeper than `page.tsx`'s `../../../../components/formConfig`, matching the deals hooks' relative-import convention).

**Contract**:
```typescript
type UsePersonGuardedMutationOptions = {
  data: PersonOverview | null
  dataRef: React.RefObject<PersonOverview | null>
  organizationId: string | null | undefined
  loadData: (lockTokenOverride?: string | null) => Promise<void>
  runMutationWithContext: <T>(operation: () => Promise<T>, mutationPayload?: Record<string, unknown>) => Promise<T>
  formWrapperRef: React.RefObject<HTMLDivElement | null>
  tagsSectionControllerRef: React.RefObject<TagsSectionController | null>
  confirm: ReturnType<typeof useConfirmDialog>['confirm']
  router: ReturnType<typeof useRouter>
  t: ReturnType<typeof useT>
}

type UsePersonGuardedMutationResult = {
  isSaving: boolean
  handleFormSubmit: (values: PersonEditFormValues) => Promise<void>
  handleFormDelete: () => Promise<void>
  handleHeaderSave: () => void
}

export function usePersonGuardedMutation(options: UsePersonGuardedMutationOptions): UsePersonGuardedMutationResult
```

#### 2. Wire the hook into the page

**File**: `packages/core/src/modules/customers/backend/customers/people-v2/[id]/page.tsx`

**Intent**: Replace the inline `isSaving` state and `handleFormSubmit`/`handleFormDelete`/`handleHeaderSave` `useCallback` definitions with a single `usePersonGuardedMutation({ data, dataRef, organizationId, loadData, runMutationWithContext, formWrapperRef, tagsSectionControllerRef, confirm, router, t })` call, destructuring `{ isSaving, handleFormSubmit, handleFormDelete, handleHeaderSave }`.

**Contract**: All existing JSX wiring (`CrudForm`'s `onSubmit`/`onDelete`, header save button `onClick`, `isSaving`-driven disabled states) references the same function/state names, now sourced from the hook — no JSX changes beyond the destructuring source.

#### 3. Characterization test

**File**: `packages/core/src/modules/customers/backend/customers/people-v2/[id]/hooks/__tests__/usePersonGuardedMutation.optimisticLock.test.tsx`

**Intent**: RTL `renderHook` test mirroring `useDealFormHandlers.optimisticLock.test.tsx`'s mocking strategy (`updateCrud`/`deleteCrud` mocked; `withScopedApiRequestHeaders` mocked to capture headers into an array and immediately invoke the wrapped function; `flash`, `useConfirmDialog` (confirm resolves `true`), `next/navigation` (`useRouter`), `useT` mocked). Two cases: (1) `handleFormSubmit` sends `{ [OPTIMISTIC_LOCK_HEADER_NAME]: <dataRef.current.person.updatedAt> }` to the captured headers array before calling `updateCrud`; (2) `handleFormDelete` sends `{ [OPTIMISTIC_LOCK_HEADER_NAME]: <data.person.updatedAt> }` before calling `deleteCrud`.

**Contract**: `OPTIMISTIC_LOCK_HEADER_NAME` imported from `@open-mercato/shared/lib/crud/optimistic-lock-headers`, matching the existing `page.test.tsx` PR #2055 test's assertion shape.

### Success Criteria:

#### Automated Verification:

- New hook test (`usePersonGuardedMutation.optimisticLock.test.tsx`) passes, covering both the update and delete optimistic-lock header cases.
- Existing test `packages/core/src/modules/customers/backend/customers/people-v2/[id]/__tests__/page.test.tsx` — specifically "sends the optimistic-lock header on person delete (PR #2055 QA)" — continues to pass unchanged.
- `yarn workspace @open-mercato/core build` succeeds.
- `yarn typecheck` passes.
- `yarn lint` passes for the touched files.

#### Manual Verification:

- In dev, open a person detail page (`/backend/customers/people-v2/<id>`), edit a field, and save — confirm the success flash and reload behavior (including the lock-token-pinning behavior from PR #2055) are unchanged.
- Delete a person from the detail page — confirm the confirm dialog, deletion, and redirect to the people list are unchanged.
- Edit the same person in two tabs and save in both — confirm the unified conflict bar (`surfaceRecordConflict`) still renders on the second save.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `customerUserSummary.test.ts` (Phase 1): empty input, multi-user mapping, missing-user fallback.
- `loadPersonDetailCustomFields.test.ts` (Phase 2): 4 snapshot scenarios (entity-only, profile-only, both, neither).
- `usePersonGuardedMutation.optimisticLock.test.tsx` (Phase 3): update header, delete header.

### Integration Tests:

- None required — all three phases are internal extractions/migrations preserving existing external contracts (API response shapes, optimistic-lock header behavior). Existing integration/unit tests in `customers/api/activities/__tests__/` and `customers/backend/customers/people-v2/[id]/__tests__/page.test.tsx` serve as regression coverage.

### Manual Testing Steps:

1. Phase 1: call `GET /api/customers/activities` for an entity with activities/comments that have authors; confirm `authorName`/`authorEmail` are plaintext.
2. Phase 2: open a person detail page with both entity- and profile-level custom field values set; confirm "Custom attributes" renders unchanged.
3. Phase 3: save, delete, and trigger a two-tab conflict on a person detail page; confirm all three flows behave as before.

## Performance Considerations

None of the three phases change query shape, indexing, or caching — Phase 1 adds one `findWithDecryption` call where an `em.find` call existed before (same query, plus decryption overhead already paid by `interactionReadModel.ts` elsewhere); Phases 2 and 3 are pure code-organization changes with no new I/O.

## Migration Notes

No database schema or data migrations. No deprecation period needed — all three changes are internal to the `customers` module (no contract-surface changes per `BACKWARD_COMPATIBILITY.md`): `decorateActivityItems`'s exported signature is unchanged, the `people/[id]` GET response shape is unchanged, and `usePersonGuardedMutation` is a new, non-exported page-local hook.

## References

- Related research: `context/changes/refactor-opportunities/research.md`
- Upstream analysis: `context/changes/post-flow-analysis/research.md`
- C1 precedent: `packages/core/src/modules/customers/lib/interactionReadModel.ts:149-170`
- C4 precedent: `packages/core/src/modules/customers/api/people/[id]/route.ts:235-294` (`resolveTodoDetails`)
- C5 precedent: `packages/core/src/modules/customers/backend/customers/deals/[id]/hooks/useDealFormHandlers.ts` + `useDealFormHandlers.optimisticLock.test.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared `CustomerUserSummary` loader + migrate `activities/route.ts` (C1)

#### Automated

- [x] 1.1 New unit test `customerUserSummary.test.ts` passes (multi-user mapping, empty input, missing-user fallback) — 5d631ae26
- [x] 1.2 Existing `customers/api/activities/__tests__/*` tests pass — 5d631ae26
- [x] 1.3 `yarn workspace @open-mercato/core build` succeeds — 5d631ae26
- [x] 1.4 `yarn typecheck` passes — 5d631ae26
- [x] 1.5 `yarn lint` passes for touched files — 5d631ae26

#### Manual

- [x] 1.6 `GET /api/customers/activities` returns decrypted `authorName`/`authorEmail` — ae887fe4f

### Phase 2: Extract custom-fields helper from `people/[id]/route.ts` (C4)

#### Automated

- [x] 2.1 New `loadPersonDetailCustomFields.test.ts` passes with committed baseline snapshots (4 scenarios) — 95cf63c5e
- [x] 2.2 `yarn workspace @open-mercato/core build` succeeds — 95cf63c5e
- [x] 2.3 `yarn typecheck` passes — 95cf63c5e
- [x] 2.4 `yarn lint` passes for touched files — 95cf63c5e

#### Manual

- [x] 2.5 Person detail page "Custom attributes" group renders unchanged for entity+profile custom fields — 95cf63c5e

### Phase 3: Extract `usePersonGuardedMutation` hook from `people-v2/[id]/page.tsx` (C5)

#### Automated

- [x] 3.1 New `usePersonGuardedMutation.optimisticLock.test.tsx` passes (update + delete header cases) — ae887fe4f
- [x] 3.2 Existing PR #2055 delete-header test in `page.test.tsx` continues to pass — ae887fe4f
- [x] 3.3 `yarn workspace @open-mercato/core build` succeeds — ae887fe4f
- [ ] 3.4 `yarn typecheck` passes — blocked by pre-existing unrelated failure (staff timesheets `staff_time_project` entity-id, confirmed present without this phase's diff)
- [ ] 3.5 `yarn lint` passes for touched files — blocked by pre-existing repo-wide eslint crash (`eslint-plugin-react` version-detection `TypeError`, reproduces on already-committed files)

#### Manual

- [x] 3.6 Save flow on person detail page unchanged — ae887fe4f
- [x] 3.7 Delete flow on person detail page unchanged — ae887fe4f
- [x] 3.8 Two-tab conflict bar still renders on second save — ae887fe4f
