# Workflow 4 — Job & Opportunity Discovery · Plan

Scope (the *what*): `scope.md`
This file (the *how/when* + dependencies + blockers): single source of truth for execution.

## Problem
Transform the relationship web from a pure networking tool into a job-hunting accelerator. Surface relevant job postings from the dataset, cross-reference them against the user's seeded web ("2 people in your web worked at Innovatech, which has 3 open roles"), and render each connection's career timeline.

## Execution model
- **One small PR per step.**
- **No chained branches.** Each step branches **fresh off `main`**. Flow: build a step → open its PR → merge it → `git checkout main && git pull` → start the next step off the updated main.
- Rationale: `main` moves fast (W1/W2/W3 merging in parallel); chaining branches caused repeated multi-way merge conflicts. Fresh-off-main keeps every PR a clean, isolated diff.
- Every step: own branch + PR + unit tests + cross-workflow deps/blockers documented here.

## Progress
| Step | Branch | Status | PR |
|------|--------|--------|----|
| 1. job types + Vitest infra | `w4-step1-types` | ✅ **merged** | [#2](https://github.com/jogueh/possibilities-hack-A2J2/pull/2) |
| 2. shared scoring engine | `w4-step2-scoring-engine` | ✅ **ready to merge** (clean) | [#18](https://github.com/jogueh/possibilities-hack-A2J2/pull/18) |
| 3. web overlap | _fresh off main_ | 🔁 code written + reconciled; recreate PR | — (old #20 closed) |
| 4. job matching | _fresh off main_ | 🔁 code written + reconciled; recreate PR | — (old #21 closed) |
| 5. jobs panel | _fresh off main_ | ⬜ pending | — |
| 6. canvas overlay | _fresh off main_ | ⬜ pending | — |
| 7. career timeline | _fresh off main_ | ⬜ pending | — |
| 8. why-now badge | _fresh off main_ | ⬜ pending | — |
| 9. verify | _fresh off main_ | ⬜ pending | — |
| **— Stretch: "Living Web" cluster —** | | | |
| 10. activity status ring | _fresh off main_ | ⬜ stretch | — |
| 11. "I met up" button | _fresh off main_ | ⬜ stretch | — |
| 12. edge strength visuals | _fresh off main_ | ⬜ stretch | — |

## Global rules
- Datasets are static → `force-cache`, **no revalidation**.
- **W4 owns `src/lib/scoring.ts`** (the shared scoring engine, pure functions). `main` currently contains a clearly-labeled MOCK placeholder; Step 2 / PR #18 replaces it with the real implementation. Do **not** invent a parallel scoring system.
- W4 builds **pure logic only** — no API routes, no LLM calls. The thin `/api/jobs/matches` route wrapper is W2's (data-fetching layer); see the message to W2 below.
- Timeline date ranges are **approximate** — anchor on `graduation_year`, label `~[year]`, never fabricate exact dates.
- **Salary data must never be rendered**, even though `salary_range` exists on job records.

## Integration with main's canonical types (IMPORTANT)
Main now owns the shared contracts; W4 consumes them — do not redefine these locally:
- `ParsedGoal` → `@/types/goal` (produced by W2's `parseGoal`).
- `User`, `Job`, `UserWithJobs` → `@/types/data`. **`UserWithJobs.job_history` is `Job[]`** (resolved in place — there is no separate `jobs` field).
- `WebNode`/`WebEdge` → `@/types/web`.
- Scoring derivations are named **`deriveAlignmentTier(score)`** and **`deriveActivityStatus(user)`** (match the former mock's signatures exactly).
- **`JobMatch` has no `easyApply` field** — W3 removed it; consumers read `job.easy_apply` directly.
- The old `_w1Contract.mock.ts` / `_w2Contract.mock.ts` / `types/scoring.ts` shims are **deleted** (real types exist now).

## Blocker legend
✅ available · 🟡 mocked locally until upstream lands (non-blocking) · 🔴 hard blocker (cannot fully integrate until upstream ships)

---

## Steps — deps & blockers

### Step 1 — `w4-step1-types` ✅ merged
- **Exposed:** `src/types/job.ts` (`JobMatch`, `WebConnectionRef`, `JobMatchesResponse`), shared test fixtures, Vitest infra.

### Step 2 — `w4-step2-scoring-engine` ✅ ready to merge (#18)
- **Needs:** ✅ main's `@/types/goal`, `@/types/data`; ✅ W2 sign-off on W4 owning the scorer.
- **Exposes (once #18 merges):** `src/lib/scoring.ts` (pure, no API/LLM):
  - `scoreUserAgainstGoal(user: UserWithJobs, parsedGoal): number` (role 35 / industry 20 / location 20 / skills 15 / activity 10) — consumed by **W2**
  - `scoreJobAgainstGoal(job, goal): number` (role/industry/location re-weighted to 100) — consumed by step 4
  - `matchesRole`/`matchesIndustry`/`matchesLocation`, `deriveAlignmentTier`, `deriveActivityStatus`, `WEIGHTS`
- **Blockers:** until #18 merges, `main` still contains the MOCK placeholder implementation.

### Step 3 — web overlap (recreate fresh off main)
- **Needs:** ✅ step 2 merged; `UserWithJobs` from `@/types/data`.
- **Exposes:** `src/lib/webOverlap.ts` → `findWebOverlap(job, webUsers)`, `roleAtCompany(user, company)`, `overlappingUserIds(jobs, webUsers)` (consumed by steps 4, 6).
- **Blockers:** none. Pure functions. `overlapYears` left `undefined` (no job dates in dataset). 10 unit tests. (Code written; was PR #20, now closed — reopen fresh.)

### Step 4 — job matching (recreate fresh off main)
- **Needs:** ✅ steps 2–3 merged; jobs + web users.
- **Exposes:** `src/lib/jobMatches.ts` → `buildJobMatches(jobs, webUsers, goal): JobMatch[]` — scores each job, drops weak (`deriveAlignmentTier === "weak"`), attaches web overlap, sorts by relevance (web-connection count tie-break), caps at `MAX_JOB_MATCHES` (10).
- **Build note:** drop the `easyApply` field from constructed matches (`JobMatch` no longer has it).
- **Out of scope (W2 owns):** the `GET /api/jobs/matches?goal=&userId=` route wrapper — thin wrapper: `parseGoal` → resolve web users to `UserWithJobs` → `buildJobMatches`. 8 unit tests. (Code written; was PR #21, now closed — reopen fresh.)

### Step 5 — jobs panel (fresh off main)
- **Needs:** ✅ step 4; 🟡 W1 `useWebStore` (`snapshot.nodes`, `goal`); 🟡 W3 "open sidebar for userId" action.
- **Exposes:** `src/components/JobsPanel.tsx`, `JobsPanelToggle`.
- **Blockers:** 🔴 **HARD — W1 canvas page.** Mitigation: mount on a standalone `/jobs-demo` route with a mock store hook until W1's canvas lands.

### Step 6 — canvas overlay (fresh off main)
- **Needs:** ✅ step 3 overlap, step 5 panel state.
- **Exposes:** `useJobOverlapFlags(nodes, matches)` hook + `node-job-overlap` pulsing-ring CSS class.
- **Blockers:** 🔴 **HARD — W1 node renderer hook** to inject `hasJobOverlap` into React Flow node `data`. Ship hook + CSS + tests standalone; defer visual integration.

### Step 7 — career timeline (fresh off main)
- **Needs:** ✅ step 4 (matched companies); 🟡 W2 `GET /api/user/[userId]` (mock fetch).
- **Exposes:** `src/components/CareerTimeline.tsx`.
- **Blockers:** 🔴 **W3 `<CareerTimelineSlot />`** (now exists on main — re-verify the hook). Render standalone with mocked fetch + tests.

### Step 8 — why-now (fresh off main)
- **Needs:** ✅ step 5 panel, step 3 overlap, users dataset (`graduation_year`).
- **Exposes:** `isRecentlyInField(connection)` + "Recently in your field" badge.
- **Blockers:** none beyond step 5's.

### Step 9 — verify (fresh off main)
- **Exposes:** green vitest + eslint + `next build`.
- **Blockers:** inherits the 🔴 hard blockers; logic/unit layers verify independently.

---

## Upstream asks (file to W1/W2/W3 owners)
| Ask | Owner | Unblocks |
|-----|-------|----------|
| ~~Extract shared scoring helpers into `src/lib/scoring.ts`~~ | ~~W2~~ | ✅ **resolved** — W4 owns it; W2 imports it |
| Build the `GET /api/jobs/matches` route around `buildJobMatches` | W2 | Step 5 |
| Expose `useWebStore` (`snapshot.nodes` + `goal`) | W1 | Step 5 🔴 |
| Provide canvas node-data injection hook for `hasJobOverlap` | W1 | Step 6 🔴 |
| Ship `GET /api/user/[userId]` | W2 | Step 7 |
| Confirm `<CareerTimelineSlot />` hook + "open sidebar for userId" action | W3 | Steps 5, 7 |

## Stretch (only after all cores green)

### Priority cluster — "Living Web"
Highest-demo-impact stretch: makes the web visibly react to user behaviour. Build in this order (the button produces the interaction data the edges visualize). Each is its own **fresh-off-main** branch + PR + unit tests.

| Step | What | Deps & blockers |
|------|------|-----------------|
| 10. Activity Status Ring | Secondary avatar ring from `deriveActivityStatus` (blue/amber/red). Exports `ACTIVITY_RING` constant in `src/lib/activityColors.ts`. Rendered on W1 nodes + W3 header, with hover tooltip. | 🟡 W2 wires `activityStatus` onto `WebNode` (mock until then) · 🔴 W1 node renderer + W3 sidebar header |
| 11. "I Met Up" button | Button in W3 Actions bar → `updateInteractionScore(nodeId, edgeId, +20)`, toast, disables for session. No backend. Produces the data step 12 visualizes. | 🟡 W1 store `updateInteractionScore` (mock until then) · 🔴 W3 Actions-bar slot |
| 12. Edge Strength visuals | Custom `StrengthEdge.tsx`; tiered look (grey→blue→indigo→violet-gradient+pulse) from `WebEdge.strength`. Extract pure `strengthTier(strength)` util for tests. Dotted edges always dashed. | 🔴 W1 must register the custom edge type in React Flow config |

**Testable cores (build standalone even while UI-blocked):** `activityRingColor(status)` constant · `strengthTier(strength)` pure function · the interaction-increment logic.

### Other stretch (lower priority)
Jobs Panel filter bar · Save Job bookmark · Goal Proximity job boost · plus the remaining cross-project stretch goals catalogued in `scope.md` (streaks, badges, notes, goal proximity score, copy-tip, LinkedIn deep link).
