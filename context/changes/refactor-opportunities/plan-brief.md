# Refactor Opportunities — First Steps (C1, C4, C5) — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`

## What & Why

`research.md` classified the technical debt from `post-flow-analysis/research.md` into 6 refactor candidates and ranked the top 3, each with a low-risk "first step." This plan turns those three first steps into concrete implementation phases: (1) a shared `CustomerUserSummary` loader to start retiring cross-module `customers → auth` ORM imports, (2) extracting the custom-fields block from the hand-rolled `people/[id]` detail route, and (3) extracting the optimistic-lock-aware handlers from the `people-v2/[id]` detail page into a hook.

## Starting Point

- `activities/route.ts` imports `User` from `auth/data/entities` directly and reads `name`/`email` via plain `em.find` — but these fields are encrypted, so today it returns ciphertext.
- `people/[id]/route.ts` is a 1203-line hand-rolled GET handler with zero unit tests; its custom-fields logic (lines 679-716) is inlined.
- `people-v2/[id]/page.tsx` has its 2 optimistic-lock-header call sites (update + delete) inlined in the page component, unlike the deals detail page which already extracted this into `useDealFormHandlers`.

## Desired End State

- A new `customers/lib/customerUserSummary.ts` provides `loadCustomerUserSummaries()`; `activities/route.ts` uses it and no longer imports `User` from `auth`, and now returns correctly decrypted author name/email.
- `people/[id]/route.ts` has a new `loadPersonDetailCustomFields()` helper (mirroring the existing `resolveTodoDetails` pattern) with its own snapshot test — the route's first unit test coverage.
- `people-v2/[id]/page.tsx` delegates to a new `usePersonGuardedMutation()` hook (mirroring `useDealFormHandlers`), with a characterization test for both header call sites; the existing PR #2055 delete-header test stays green.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Phases to implement | All three first steps (C1 + C4 + C5) | All three were top-ranked, low-risk, and each has a clear in-repo precedent | Research |
| Extra cleanups (dead `RESOURCE_KIND_PEOPLE`, dup `CompanyPersonSummary`) | Excluded — separate change | Keeps this change focused on the 3 ranked structural first steps | Plan |
| C4 test strategy | Full-response snapshot test, scoped to the new extracted helper's return value | The route has zero test harness; testing the helper in isolation is tractable, the full GET handler is not | Plan |
| C5 test strategy | RTL `renderHook` unit test mocking `apiCallOrThrow`/`updateCrud`/`deleteCrud`/`withScopedApiRequestHeaders` | Exact template already exists (`useDealFormHandlers.optimisticLock.test.tsx`) | Plan |
| C1 loader location & scope | New file in `customers/lib/`, narrow to `activities/route.ts`'s `{id, name, email}` needs | Matches `interactionReadModel.ts`'s precedent without over-generalizing | Plan |
| C1 orphaned-FK handling | Preserve current behavior — missing `User` row is simply absent from the map | No observed need to change null-handling semantics for this first step | Plan |
| C1 encryption correctness | New loader uses `findWithDecryption` (vs. current plain `em.find`) | Matches AGENTS.md "Always use findWithDecryption" and `interactionReadModel.ts`; fixes a latent ciphertext bug on this deprecated route as a side effect | Plan |

## Scope

**In scope:**
- New `customers/lib/customerUserSummary.ts` (DTO + loader) and migration of `activities/route.ts`'s `decorateActivityItems()`.
- Extraction of `loadPersonDetailCustomFields()` from `people/[id]/route.ts` + new snapshot test.
- Extraction of `usePersonGuardedMutation()` from `people-v2/[id]/page.tsx` + new characterization test.

**Out of scope:**
- C2 (kernel SCC), C3 (hand-wired optimistic-lock readers), C6 (`PersonCard` ↔ `CompanyPeopleSection` cycle) — left as backlog per research.
- The other 6 files importing `User` from `auth` — only `activities/route.ts` migrates.
- Dead `RESOURCE_KIND_PEOPLE` code and duplicate `CompanyPersonSummary` type cleanups.
- Full-route integration test for `GET /api/customers/people/[id]`.

## Architecture / Approach

Each phase mirrors an existing in-repo pattern exactly: Phase 1 mirrors `interactionReadModel.ts`'s `findWithDecryption`-based summary loader; Phase 2 mirrors `resolveTodoDetails`'s locally-defined-helper-with-optional-profiler shape; Phase 3 mirrors `useDealFormHandlers` + its test. No new abstractions are introduced — each phase reduces an existing inconsistency by aligning one file with a pattern already proven elsewhere in the same module.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. `CustomerUserSummary` loader (C1) | New shared loader; `activities/route.ts` migrated, drops `User` import, fixes latent ciphertext bug | Output change (ciphertext → plaintext) on a deprecated route — flagged as intentional in PR description |
| 2. Custom-fields helper extraction (C4) | `loadPersonDetailCustomFields()` + first-ever unit test for this route | Snapshot test only covers the helper, not the full GET response |
| 3. `usePersonGuardedMutation` hook (C5) | Hook extraction + characterization test; PR #2055 test stays green | Missing a dependency the inline handlers closed over (mitigated by exact `useDealFormHandlers` template) |

**Prerequisites:** None — all three phases build on code that exists today.
**Estimated effort:** ~1 session per phase, 3 phases, each independently shippable as its own PR.

## Open Risks & Assumptions

- Phase 1 assumes `User` rows for activity authors are properly tenant/org-scoped, so adding `findWithDecryption`'s tenant filter doesn't drop legitimate authors from the result set.
- Phase 2's snapshot baseline is new to this module (no prior `toMatchSnapshot` usage in `customers`) — first run establishes the baseline, reviewers should sanity-check its content.

## Success Criteria (Summary)

- `activities/route.ts` no longer imports `User` from `auth`, and returns decrypted author name/email.
- `people/[id]/route.ts`'s `customFields` response field is unchanged, now backed by a tested helper.
- `people-v2/[id]/page.tsx`'s save/delete/header-save behavior (including the PR #2055 optimistic-lock fix) is unchanged and now covered by a hook-level test.
