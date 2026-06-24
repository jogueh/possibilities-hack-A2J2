# Workflow 3 — Node Profile Sidebar + Connection Intelligence — Implementation Plan

## Problem & Approach

W3 owns the **profile sidebar** that opens on node click: profile header, goal-relevant
experience, commonalities, AI talking point, 2nd-degree preview, and Connect/Message actions.

**Blocking reality:** the repo is currently an antd LinkedIn clone. None of W3's upstream
dependencies exist yet — no `src/types/web.ts` (W1), no `useWebStore` (W1), no
`alignmentColors.ts` (W1), no `GET /api/user/[userId]` (W2), no Vitest/RTL test tooling (W1).

**Strategy (agreed with user):** build *all* W3 steps independently behind **clearly-labeled
MOCK modules** that reuse the **exact symbol names and API paths** from the W1/W2/W4 specs.
Mocks live in a separate, clearly-marked location (`src/mocks/`) so they never collide with
W1/W2's canonical files — integration later is a clean import-swap, not a merge conflict.

### Mock-vs-real contract rules
- Every mock file starts with a banner comment: `// ⚠️ W3 MOCK — replace with W1/W2 real impl. See plan.md`.
- Mocks export the **same names** as the real thing: `WebNode`, `WebEdge`, `GoalQuery`,
  `AlignmentTier`, `useWebStore`, `addSecondDegreeNode`, `Job`, `User`, `UserWithJobs`,
  `ParsedGoal`, alignment color constants.
- W3-**owned** types/files stay at their real canonical paths (not mocks): `SharedContext`,
  `src/lib/relevance.ts`, `src/lib/sharedContext.ts`, `src/components/NodeSidebar.tsx`,
  `src/app/api/node/talking-points/route.ts`.
- A single `INTEGRATION.md` checklist tracks each mock → real swap.

---

## Execution Protocol (per step)
Every step is shipped as its own unit:
1. **Branch:** `w3/NN-slug` (independent steps branch from `main`; dependent steps branch
   after their dependency merges, or stack on the dependency branch).
2. **Implement** the step's files + **unit tests** (Vitest + React Testing Library).
3. **Cross-workflow dependencies:** the PR description must list a **Consumes** block (what
   it takes from W1/W2/W4 + which mock currently stands in) and a **Provides** block (what
   W3 exposes to other workflows). These are mirrored into `INTEGRATION.md` and the
   `todo_deps` table so the dependency graph is explicit and tracked.
4. **PR:** one PR per step, green tests + lint required before merge.

---

## Steps

### Step 0 — Foundation: test tooling + labeled mocks  (`w3/00-foundation-mocks`)
Scaffolding only; no feature logic. Unblocks every other step.
- Add **Vitest + React Testing Library + jsdom** config (⚠️ W3-temporary, reconcile with W1's
  stack bootstrap). Add `test` script to `package.json`.
- `src/mocks/web.ts` — MOCK of W1 `src/types/web.ts` (`WebNode`, `WebEdge`, `GoalQuery`,
  `AlignmentTier`, `WebState`, `DegreeLevel`).
- `src/mocks/data.ts` — MOCK of W2 raw types (`User`, `Job`, `UserWithJobs`, `ParsedGoal`).
- `src/mocks/alignmentColors.ts` — MOCK of W1 alignment ring color constants.
- `src/mocks/useWebStore.ts` — MOCK Zustand store exposing `goal`, `nodes`,
  `addSecondDegreeNode(node)` (matches W1/W4 signatures).
- `src/mocks/userApi.ts` + fixtures — MOCK of W2 `GET /api/user/[userId]` (returns
  `UserWithJobs`, 404 path) for tests + dev.
- `src/types/sharedContext.ts` — **W3-OWNED** `SharedContext` type.
- `src/lib/linkedinTokens.ts` — LinkedIn color/spacing tokens (mock of W1 design tokens) so
  styling needs no Tailwind/shadcn yet.
- **Tests:** sanity test that mocks import & satisfy expected shapes.
- **Consumes:** (none — defines the shims). **Provides:** mock contracts to all W3 steps.

### Step 1 — Experience relevance filter  (`w3/01-relevance`) — INDEPENDENT
- `src/lib/relevance.ts`: `filterRelevantJobs(jobs, parsedGoal)` — overlap on
  `position`/`industry` vs `targetRole`/`targetIndustry`; fallback to 2 most recent;
  **never expose salary**.
- `src/lib/relevance.test.ts`: goal-matched jobs; fallback path; asserts no `salary_range`.
- **Consumes:** `Job`, `ParsedGoal` (mock types, Step 0). **Provides:** `filterRelevantJobs`
  used by Step 4 sidebar.

### Step 2 — Commonalities detector  (`w3/02-shared-context`) — INDEPENDENT
- `src/lib/sharedContext.ts`: `getSharedContext(viewer, target)` → `SharedContext[]`
  (school/company/skill/location); dedupe; empty array when none.
- `src/lib/sharedContext.test.ts`: each overlap type; empty case; dedupe.
- **Consumes:** `UserWithJobs` (mock, Step 0), `SharedContext` (W3-owned).
  **Provides:** `getSharedContext` used by Steps 3 & 4.

### Step 3 — Talking-point API route  (`w3/03-talking-points-api`) — INDEPENDENT (W3-owned)
- `src/app/api/node/talking-points/route.ts`: `POST` → `{ tip }`. OpenRouter
  `openai/gpt-4o-mini` call; **5s timeout → static fallback**
  (`"Mention your shared background in …"`).
- `route.test.ts`: response shape; fallback on timeout/no-key; salary never in prompt input.
- **Consumes:** OpenRouter config (W2 — env/mock for now), `SharedContext`.
  **Provides:** `/api/node/talking-points` endpoint (W3-owned, real path).

### Step 4 — Sidebar shell + header + experience + commonalities + tip  (`w3/04-sidebar-shell`) — DEPENDENT
- `src/components/NodeSidebar.tsx`: right slide-in panel (380px), X/outside-click close,
  loading skeleton, error state. Sections: profile header (avatar ring via mock
  `alignmentColors`, name, role+company, location, alignment label), experience rows (via
  Step 1, level badge, **no salary**), commonalities chips (via Step 2, max 3, hide if empty),
  AI talking-point callout (via Step 3, **cache per `userId`**). Exposes a named
  `<CareerTimelineSlot />` placeholder for W4.
- `NodeSidebar.test.tsx`: skeleton while loading; header name/role; commonalities hidden when
  empty; talking-point cached on re-open.
- **Consumes:** `useWebStore` (W1 mock — `goal`,`nodes`), `GET /api/user/[userId]` (W2 mock),
  `alignmentColors` (W1 mock); Steps 1–3. **Provides:** `NodeSidebar`, `CareerTimelineSlot`
  placeholder (→ W4).

### Step 5 — 2nd-degree preview + Add-to-web  (`w3/05-second-degree`) — DEPENDENT  _(REMOVED in #95 — the preview list and Add-to-web button were dropped in favor of on-canvas warm-path offshoots. Historical.)_
- Add "People [Name] can introduce you to" section: up to 3 pre-loaded 2nd-degree nodes from
  store; each row avatar/name/role/reason; **"Add to web"** → `addSecondDegreeNode(node)`;
  button → "Added ✓" (disabled). Omit section if none.
- Test: "Added ✓" state after click; section hidden when no 2nd-degree nodes.
- **Consumes:** store `nodes` (W1/W2 mock), `addSecondDegreeNode` action (**W4**-owned / W1
  store, mock). **Provides:** add-to-web interaction wired into sidebar.

### Step 6 — Actions bar: Connect / Message  (`w3/06-actions-bar`) — INDEPENDENT UI (merges after Step 4)
- Connect button → confirm modal → success toast (UI only). Message button → composer modal
  pre-filled from AI tip → success toast (UI only). Full-width LinkedIn-style buttons.
- Test: connect modal appears on Connect click; message composer pre-fills subject from tip.
- **Consumes:** LinkedIn tokens (Step 0); mounts in `NodeSidebar` Actions section (Step 4).
  **Provides:** Actions bar (and the `MetUpButton`/`CopyTip`/deep-link slots stay free for W4
  stretch).

---

## Cross-workflow dependency summary

| W3 needs | From | Mock stand-in (Step 0) |
|----------|------|------------------------|
| `WebNode/WebEdge/GoalQuery/AlignmentTier` | W1 `src/types/web.ts` | `src/mocks/web.ts` |
| `useWebStore` (`goal`, `nodes`) | W1 store | `src/mocks/useWebStore.ts` |
| `alignmentColors` constants | W1 | `src/mocks/alignmentColors.ts` |
| `addSecondDegreeNode(node)` action | W4 (action) / W1 (store) | mock store action |
| `GET /api/user/[userId]` → `UserWithJobs` | W2 | `src/mocks/userApi.ts` |
| `Job/User/UserWithJobs/ParsedGoal` types | W2 `src/types/data.ts` | `src/mocks/data.ts` |
| OpenRouter config | W2 | env / mock in Step 3 |
| Vitest + RTL tooling | W1 bootstrap | W3-temporary config (Step 0) |

| W3 provides | To |
|-------------|-----|
| `POST /api/node/talking-points` | W3-owned (real) |
| `<CareerTimelineSlot />` placeholder in sidebar | W4 `CareerTimeline.tsx` |
| `SharedContext` type + `getSharedContext` | W3-owned |
| Actions-bar slots (MetUp / CopyTip / deep-link) | W4 stretch |

---

## Notes & considerations
- **Salary data must never render or enter the LLM prompt** — asserted in tests (Steps 1, 3).
- **Sidebar is read-only to the graph** — only dispatches named store actions, never mutates
  `WebNode`/`WebEdge`.
- **Goal context always present** — read `goal.raw` from store; never re-prompt.
- **Talking point cached per `userId`** in component state.
- Styling uses mock LinkedIn tokens / plain CSS to avoid prematurely pulling in Tailwind/shadcn
  (W1's choice); revisit during integration.
- **Out of scope (do not build here):** canvas/layout (W1), scoring/`/api/user` impl (W2),
  CareerTimeline body & job overlap (W4), all stretch goals (W4).
- Parallelizable: Steps 1, 2, 3, 6 are independent after Step 0; Step 4 needs 1–3; Step 5 needs 4.
