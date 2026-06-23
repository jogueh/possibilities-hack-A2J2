# Workflow 4 — Job & Opportunity Discovery · Plan

Scope (the *what*): `scope.md`
This file (the *how/when* + dependencies + blockers): single source of truth for execution.

## Problem
Transform the relationship web from a pure networking tool into a job-hunting accelerator. Surface relevant job postings from the dataset, cross-reference them against the user's seeded web ("2 people in your web worked at Innovatech, which has 3 open roles"), and render each connection's career timeline.

## Execution model
- **9 granular PRs**, one per step.
- Each step branch is **chained off the previous step's branch** (`planning → step1 → step2 → …`).
- Every step: own branch + PR + unit tests + cross-workflow deps/blockers documented here.

```
planning
 └─ w4-step1-types
     └─ w4-step2-job-scoring
         └─ w4-step3-web-overlap
             └─ w4-step4-jobs-api
                 └─ w4-step5-jobs-panel
                     └─ w4-step6-canvas-overlay
                         └─ w4-step7-career-timeline
                             └─ w4-step8-why-now
                                 └─ w4-step9-verify
```

## Progress
| Step | Branch | Status | PR |
|------|--------|--------|----|
| 1. job types + Vitest infra | `w4-step1-types` | ✅ done | [#2](https://github.com/jogueh/possibilities-hack-A2J2/pull/2) |
| 2. job scoring | `w4-step2-job-scoring` | ⬜ next | — |
| 3. web overlap | `w4-step3-web-overlap` | ⬜ pending | — |
| 4. jobs match API | `w4-step4-jobs-api` | ⬜ pending | — |
| 5. jobs panel | `w4-step5-jobs-panel` | ⬜ pending | — |
| 6. canvas overlay | `w4-step6-canvas-overlay` | ⬜ pending | — |
| 7. career timeline | `w4-step7-career-timeline` | ⬜ pending | — |
| 8. why-now badge | `w4-step8-why-now` | ⬜ pending | — |
| 9. verify | `w4-step9-verify` | ⬜ pending | — |

## Global rules
- Datasets are static → `force-cache`, **no revalidation**.
- Job scoring **reuses W2 signals** (`src/lib/scoring.ts`) — do NOT invent a parallel system.
- Timeline date ranges are **approximate** — anchor on `graduation_year`, label `~[year]`, never fabricate exact dates.
- **Salary data must never be rendered**, even though `salary_range` exists on job records.

## Blocker legend
✅ available · 🟡 mocked locally until upstream lands (non-blocking) · 🔴 hard blocker (cannot fully integrate until upstream ships)

---

## Steps — deps & blockers

### Step 1 — `w4-step1-types` ✅
- **Needs:** 🟡 W1 `web.ts` (`WebNode`/`WebEdge`/`GoalQuery`); 🟡 W2 `ParsedGoal` → both mocked in `src/types/_w1Contract.mock.ts`, `_w2Contract.mock.ts`
- **Exposes:** `src/types/job.ts` (`Job`, `JobMatch`, `WebConnectionRef`), Vitest infra — consumed by steps 2–8
- **Blockers:** none. Fully self-contained against mocks.

### Step 2 — `w4-step2-job-scoring`
- **Needs:** ✅ step 1 types; 🟡 W2 shared signal helpers (`matchesRole`/`matchesIndustry`/`matchesLocation`)
- **Exposes:** `src/lib/jobScoring.ts` → `scoreJobAgainstGoal(job, parsedGoal)` (consumed by step 4)
- **Blockers:** 🟡 *Soft* — must extract shared scoring helpers into `src/lib/scoring.ts` with W2. Mock locally with a `TODO(W2)` marker; reconcile before final merge to avoid divergent scoring.

### Step 3 — `w4-step3-web-overlap`
- **Needs:** ✅ step 1 types; 🟡 W1 `WebNode` + resolved job history (node.userId → user → job_history)
- **Exposes:** `src/lib/webOverlap.ts` → `findWebConnections(company, nodes, userIndex)` (consumed by steps 4, 5)
- **Blockers:** none. Pure function over mocked node fixtures.

### Step 4 — `w4-step4-jobs-api`
- **Needs:** ✅ steps 1–3; 🟡 W2 `parseGoal` (keyword-fallback mock); ✅ jobs + users datasets
- **Exposes:** `GET /api/jobs/matches?goal=&userId=` → `{ matches: JobMatch[] }` (consumed by steps 5, 7)
- **Blockers:** 🟡 *Soft* — uses mocked `parseGoal` until W2 ships the real LLM parser; behaviour is correct but extraction quality is lower.

### Step 5 — `w4-step5-jobs-panel`
- **Needs:** ✅ step 4 API; 🟡 W1 `useWebStore` (`snapshot.nodes`, `goal`); 🟡 W3 "open sidebar for userId" action
- **Exposes:** `src/components/JobsPanel.tsx`, `JobsPanelToggle` (briefcase button for W1 top nav)
- **Blockers:** 🔴 **HARD — W1 app scaffold.** No Next.js+React Flow canvas page exists yet. Mitigation: mount the panel on a standalone `/jobs-demo` route with a mock store hook until W1's canvas lands, then relocate.

### Step 6 — `w4-step6-canvas-overlay`
- **Needs:** ✅ step 3 overlap, step 5 panel state
- **Exposes:** `useJobOverlapFlags(nodes, matches)` hook + `node-job-overlap` pulsing-ring CSS class
- **Blockers:** 🔴 **HARD — W1 canvas node renderer.** Needs a hook point to inject `hasJobOverlap` into React Flow node `data`. Mitigation: ship the hook + CSS standalone with unit tests; visual integration deferred until W1 exposes the node-data injection point (filed as upstream ask).

### Step 7 — `w4-step7-career-timeline`
- **Needs:** ✅ step 4 API (matched companies); 🟡 W2 `GET /api/user/[userId]` (mock fetch)
- **Exposes:** `src/components/CareerTimeline.tsx`
- **Blockers:** 🔴 **HARD — W3 `<CareerTimelineSlot />`.** The sidebar slot doesn't exist yet. Mitigation: render standalone with mocked user fetch + tests; slot it into W3 once exposed.

### Step 8 — `w4-step8-why-now`
- **Needs:** ✅ step 5 panel, step 3 overlap, users dataset (`graduation_year`)
- **Exposes:** `isRecentlyInField(connection)` + "Recently in your field" badge
- **Blockers:** none beyond step 5's (rides on the panel).

### Step 9 — `w4-step9-verify`
- **Needs:** ✅ all prior steps merged into the chain
- **Exposes:** green vitest + eslint + `next build`
- **Blockers:** inherits the 🔴 hard blockers above — full end-to-end build/integration cannot be declared complete until W1 canvas + W3 sidebar slot ship. Logic/unit layers verify independently.

---

## Upstream asks (file to W1/W2/W3 owners)
| Ask | Owner | Unblocks |
|-----|-------|----------|
| Publish `src/types/web.ts` contract | W1 | Step 1 (already mocked) |
| Extract shared scoring helpers into `src/lib/scoring.ts` | W2 | Step 2 |
| Expose `useWebStore` (`snapshot.nodes` + `goal`) | W1 | Step 5 🔴 |
| Provide canvas node-data injection hook for `hasJobOverlap` | W1 | Step 6 🔴 |
| Ship `GET /api/user/[userId]` | W2 | Step 7 |
| Add `<CareerTimelineSlot />` + "open sidebar for userId" action | W3 | Steps 5, 7 🔴 |

## Stretch (only after all cores green)
Jobs Panel filter bar · Save Job bookmark · Goal Proximity job boost · plus the cross-project stretch goals catalogued in `scope.md`.
