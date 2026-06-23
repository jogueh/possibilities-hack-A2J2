# Workflow 4 — Cross-Workflow Dependencies (per step)

This document tracks, for each W4 step, exactly what it **needs** from other workflows (W1/W2/W3) and what it **exposes** to them. Each step is shipped as its own branch + PR, chained off the previous step's branch.

> **Legend:** ✅ available · 🟡 mocked locally until upstream lands · 🔴 hard blocker

---

## Branch chain
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

---

## Step 1 — `w4-step1-types`
**Needs**
- 🟡 W1 `src/types/web.ts` (`WebNode`, `WebEdge`, `GoalQuery`) — mock locally if not merged
- 🟡 W2 `ParsedGoal` type — mock locally

**Exposes**
- `src/types/job.ts` — `Job`, `JobMatch`, `WebConnectionRef`
- Consumed by W4 steps 2–8

---

## Step 2 — `w4-step2-job-scoring`
**Needs**
- ✅ Step 1 job types
- 🟡 W2 `src/lib/scoring.ts` shared signal helpers (`matchesRole`, `matchesIndustry`, `matchesLocation`) — **coordinate with W2 to extract these**; mock locally with TODO marker until W2 publishes

**Exposes**
- `src/lib/jobScoring.ts` — `scoreJobAgainstGoal(job, parsedGoal): number`
- Consumed by Step 4 (API)

---

## Step 3 — `w4-step3-web-overlap`
**Needs**
- ✅ Step 1 job types
- 🟡 W1 `WebNode` shape + resolved job history (a node's `userId` → user → `job_history`) — mock node fixtures

**Exposes**
- `src/lib/webOverlap.ts` — `findWebConnections(jobCompany, nodes, userIndex): WebConnectionRef[]`
- Consumed by Step 4 (API) and Step 5 (panel)

---

## Step 4 — `w4-step4-jobs-api`
**Needs**
- ✅ Steps 1–3
- 🟡 W2 `ParsedGoal` + goal parser (`parseGoal`) — mock with keyword fallback until W2 lands
- ✅ Jobs dataset `https://pit.najera.cc/jobs_data.json` (`force-cache`, no revalidation)
- ✅ Users dataset `https://pit.najera.cc/user_data.json`

**Exposes**
- `GET /api/jobs/matches?goal=&userId=` → `{ matches: JobMatch[] }`
- Consumed by Step 5 (panel) and Step 7 (timeline)

---

## Step 5 — `w4-step5-jobs-panel`
**Needs**
- ✅ Step 4 API
- 🟡 W1 `useWebStore` (reads `snapshot.nodes`, `goal`) — mock store hook until W1 lands
- 🟡 W3 sidebar open action (clicking a connection avatar opens W3 sidebar) — stub callback until W3 lands
- 🔴 React Flow / Next.js app scaffold (W1) — **panel mounts into the canvas page**; build as standalone route `/jobs-demo` until W1 canvas exists

**Exposes**
- `src/components/JobsPanel.tsx`
- `JobsPanelToggle` (briefcase button for W1 top nav)

---

## Step 6 — `w4-step6-canvas-overlay`
**Needs**
- 🔴 W1 canvas node renderer — needs a hook point to inject `hasJobOverlap` into React Flow node `data`
- ✅ Step 3 overlap util, Step 5 panel open-state

**Exposes**
- `useJobOverlapFlags(nodes, matches)` hook → returns `Record<nodeId, boolean>`
- Pulsing-ring CSS class `node-job-overlap` for W1 to apply

---

## Step 7 — `w4-step7-career-timeline`
**Needs**
- ✅ Step 4 API (matched companies list)
- 🟡 W2 `GET /api/user/[userId]` — mock fetch until W2 lands
- 🔴 W3 sidebar `<CareerTimelineSlot />` placeholder — render standalone until W3 exposes the slot

**Exposes**
- `src/components/CareerTimeline.tsx`

---

## Step 8 — `w4-step8-why-now`
**Needs**
- ✅ Step 5 panel, Step 3 overlap
- ✅ Users dataset (`school_history.graduation_year`)

**Exposes**
- `isRecentlyInField(connection): boolean` util
- "Recently in your field" badge on job cards

---

## Step 9 — `w4-step9-verify`
**Needs**
- ✅ All prior steps merged into the chain

**Exposes**
- Green vitest + eslint + `next build`

---

## Upstream asks (file these to W1/W2/W3 owners)
| Ask | Owner | Needed by |
|-----|-------|-----------|
| Publish `src/types/web.ts` contract | W1 | Step 1 |
| Extract shared scoring signal helpers into `src/lib/scoring.ts` | W2 | Step 2 |
| Expose `useWebStore` with `snapshot.nodes` + `goal` | W1 | Step 5 |
| Provide canvas node-data injection hook for `hasJobOverlap` | W1 | Step 6 |
| Ship `GET /api/user/[userId]` | W2 | Step 7 |
| Add `<CareerTimelineSlot />` to sidebar + an "open sidebar for userId" action | W3 | Steps 5, 7 |
