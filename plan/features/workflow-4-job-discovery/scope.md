# Workflow 4 — Job & Opportunity Discovery

## Owner
This workflow owns surfacing relevant job postings from the dataset, cross-referencing them against the user's seeded web, and rendering a career timeline for each connection. It transforms the web from a pure networking tool into a concrete job-hunting accelerator — showing not just *who* to talk to, but *why right now*.

---

## Dependencies
- `WebNode`, `WebEdge`, `GoalQuery` from `src/types/web.ts` (W1)
- Zustand store: reads `snapshot.nodes` and `goal` from `useWebStore`
- `GET /api/jobs/matches` — owned by this workflow
- `GET /api/user/[userId]` — owned by W2 (used to resolve connection job histories)
- Jobs dataset: `https://pit.najera.cc/jobs_data.json`
- Users dataset: `https://pit.najera.cc/user_data.json`

---

## Features in Scope

### 1. Job Matching API (`GET /api/jobs/matches`)
**Query params:** `goal` (raw string), `userId` (logged-in user)

**Response:**
```ts
{
  matches: JobMatch[]
}

interface JobMatch {
  job: Job
  relevanceScore: number        // 0–100, same scoring signals as W2
  webConnections: {             // connections in current web who worked here
    userId: string
    name: string
    role: string                // their role at this company
    overlapYears?: string       // e.g. "2021–2023"
  }[]
  easyApply: boolean
}
```

**Algorithm:**
1. Fetch + cache jobs dataset (`force-cache`, no revalidation — static dataset)
2. Score each job against `ParsedGoal` (reuse `scoreJobAgainstGoal` — similar signals to W2's user scoring: position keyword, industry, location)
3. Sort descending; take top 10
4. For each match, cross-reference against the current web's nodes: find any node whose resolved job history includes the same `company`
5. Return matches with populated `webConnections[]`

### 2. Jobs Panel (`src/components/JobsPanel.tsx`)
- Persistent collapsible panel anchored to the **left side** of the canvas (opposite the W3 sidebar on the right)
- Toggle button: briefcase icon in the top nav, always visible once web is in State B or C
- LinkedIn-style card list — each card:
  - Company name + logo placeholder (initials fallback)
  - Job title, location, level badge (Entry / Mid / Senior)
  - **"Easy Apply"** green badge if `easyApply: true`
  - Relevance pill: "Strong match" / "Moderate match"
  - **Web overlap callout** (the core differentiator): if `webConnections.length > 0`:
    - `"2 people in your web worked here"` — rendered as a highlighted strip with avatar initials of those connections
    - Clicking a connection avatar opens their W3 sidebar
  - "View role" expand chevron → expands inline to show full job description
- Panel shows up to 10 job cards; no pagination for MVP
- Empty state: "No strong matches found for your goal. Try refining it." with re-prompt CTA

### 3. Web Overlap Highlight on Canvas
- When the Jobs Panel is open, nodes in the web that have overlap with any job match get a **pulsing ring** added to their canvas avatar (LinkedIn blue `#0A66C2`)
- Ring is additive — does not replace the alignment tier ring; renders as an outer ring
- Implemented by W4 adding a `hasJobOverlap: boolean` flag to the node's React Flow data payload (not added to `WebNode` type — local React Flow data only)

### 4. Connection Career Timeline (`src/components/CareerTimeline.tsx`)
- Rendered inside the W3 sidebar below the Experience section (W3 leaves a named placeholder slot: `<CareerTimelineSlot />`)
- Shows a vertical LinkedIn-style timeline of the connection's full job history (resolved via `GET /api/user/[userId]`)
- Each entry: company, role, level, location, year range (derived from graduation year proximity — since dataset has no explicit start/end dates, use `graduation_year` of most recent degree as a reference anchor and space jobs evenly before present)
- **Job match highlight:** if any of the connection's past companies appears in the current job matches list, that timeline entry gets a LinkedIn-blue left border + label: "Open roles here"
- Clicking a highlighted timeline entry opens that job's card in the Jobs Panel

### 5. "Why Now" Recency Signal
- On each job card, if a web connection worked at the company **and** their most recent school graduation was ≤ 3 years ago: show badge `"Recently in your field"` — this signals the connection has fresh, relevant context
- Pure client-side derivation from data already in the store

---

## Unit Tests (Vitest + React Testing Library)

| Test file | What it covers |
|-----------|---------------|
| `src/lib/jobScoring.test.ts` | Score = 0 for no overlap; position/industry/location weights correct; returns ≤ 10 results; weak matches excluded |
| `src/lib/webOverlap.test.ts` | Correctly identifies nodes whose job history includes a matched company; returns empty array when no overlap; handles nodes with no job history |
| `src/app/api/jobs/matches/route.test.ts` | Response shape matches `JobMatch[]`; `webConnections` populated when overlap exists; `easyApply` flag passed through correctly |
| `src/components/JobsPanel.test.tsx` | Renders empty state when no matches; renders web overlap callout when connections exist; "Easy Apply" badge visible when flag is true |
| `src/components/CareerTimeline.test.tsx` | Renders all job history entries; highlighted entry shown when company matches job match list; no highlight when no overlap |

---

## Business Logic

- **`force-cache`, no revalidation** — jobs dataset is static and never changes.
- **Job scoring reuses the same signals as W2's user scoring** — role keyword, industry, location. Do not invent a separate scoring system; extract shared logic into `src/lib/scoring.ts` (W2 owns that file — coordinate on the shared utility).
- **Web overlap is computed client-side at render time** from the already-loaded store nodes + API response. No separate round-trip needed.
- **The Jobs Panel does not modify the web.** It is purely a discovery and context surface. It never adds/removes nodes or edges.
- **Career timeline date ranges are approximate** — the dataset has no explicit job start/end dates. Use graduation year as an anchor; space jobs evenly. Label them "~[year]" to set expectations. Do not fabricate precise dates.
- **Salary data must never be rendered** — even though `salary_range` exists on job records, it must not appear anywhere in the UI.

---

## Stretch Goals (implement only after core is complete)

- **Filter bar on Jobs Panel:** filter by location, level (Entry / Mid / Senior), Easy Apply only
- **"Save job" bookmark:** localStorage-persisted list of bookmarked job IDs; bookmark icon on each card
- **Goal proximity boost:** if the user's web has ≥ 2 connections at a job match company, boost that job's card to the top regardless of score

---

## Out of Scope (do NOT implement here)

| What | Owned by |
|------|----------|
| Canvas layout, node/edge rendering | W1 |
| AI goal parsing, user scoring | W2 |
| `GET /api/user/[userId]` endpoint | W2 |
| Profile sidebar shell | W3 |
| AI talking points | W3 |
| Streaks, badges, met-up button, notes | Stretch (sprinkled across W1–W3) |
| Real job applications or LinkedIn Easy Apply integration | Never (out of MVP) |
| Course recommendations from courses dataset | Post-MVP |
| Saving job matches to a database | Post-MVP |
