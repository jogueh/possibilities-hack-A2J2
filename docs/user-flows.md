# User Flows

> Primary user journeys inferred from the current routing, components, and API
> handlers. Update as real flows replace the mocks/placeholders.

## 1. Navigation Map

Top-level routes are driven by `src/components/TopNav.tsx` (a persistent header
rendered in the root layout). The nav tabs:

| Path             | Tab            | Status            | Entry component |
|------------------|----------------|-------------------|-----------------|
| `/`              | Home           | Built (mock data) | `app/page.tsx` → `ProfileCard` + `Feed` + `NewsPanel` + `PromoCard` |
| `/network`       | My Network     | Placeholder       | `PlaceholderPage` |
| `/web`           | Network Web    | **Built (core)**  | `app/web/page.tsx` → `WebBoard` |
| `/jobs`          | Jobs           | Placeholder       | `PlaceholderPage` |
| `/messaging`     | Messaging      | Placeholder       | `PlaceholderPage` |
| `/notifications` | Notifications  | Placeholder       | `PlaceholderPage` |
| `/me`            | Me             | Placeholder       | `PlaceholderPage` |

Non-nav harness routes (manual testing, to be removed at integration):
- `/w3-demo` — exercises the W3 `NodeSidebar` against the mock store.
- `/jobs-demo` — exercises the W4 `JobsPanel` + toggle against the mock store.

Active-tab logic: `TopNav` uses `usePathname()`; Home matches `exact`, other tabs
match the path or a `${href}/` prefix.

## 2. Authentication & Roles

**There is no authentication, session, or role-based routing.** All routes are
public and there is no login, signup, middleware, or guard. A single hard-coded
"viewer" identity stands in for the logged-in user:

- API default viewer id: **`user_4579`** (`app/api/web/generate/route.ts`).
- Demo harnesses seed the same viewer via `MOCK_USERS.user_4579`.
- The Home `ProfileCard` renders static `src/data/profile.ts` content.

The Zustand store reserves a `viewerProfile` slot (`setViewerProfile`) intended to
be populated once on app load — the hook for a future real identity, but currently
not wired to any auth provider.

## 3. Primary Journey — "Map My Web" (the flagship flow)

Implemented on `/web` via `WebBoard.tsx` + the `boardState` reducer.

1. **Define a goal.** The user types a career goal into the goal textarea (or clicks
   a static suggestion to pre-fill it). Plain **Enter submits**; **Shift+Enter** adds
   a newline.
2. **Submit.** `dispatch({ type: 'submitGoal' })` trims the text and, if non-empty,
   builds a `GoalQuery { raw, userId }` and computes a `WebSnapshot` via
   `buildSnapshot(...)`. The board transitions `empty → seeded`.
3. **View the web.** `WebCanvas` (an SVG renderer) draws the viewer at the centre,
   solid edges to 1st-degree connections, and color-coded node rings by
   `alignmentTier`. Left-column "metrics" (Goal Progress, Connection Achievability)
   are derived from the seeded nodes.
4. **Select a node.** Clicking a node dispatches `selectNode`, which calls
   `expandNode(...)` (revealing 2nd-degree warm-path nodes via dotted bridge edges,
   `seeded → expanded`) and opens a side detail card showing the tier tag, degree,
   and a "Draft warm intro" placeholder (W4 hook).
5. **Reset.** `dispatch({ type: 'reset' })` clears back to the `empty` state.

> Note: the `/web` board currently runs on the **local reducer + `src/data/web_people`**
> mock people, not the live API. The production path (below) is the intended swap.

## 4. Production Data Lifecycle (form submission → backend → render)

This is the end-to-end contract the mocks are designed to swap into:

### A. Goal → Web generation
```
goal text (client)
  └─► POST /api/web/generate  { goal, userId? }
        ├─ zod validates body (400 on bad JSON / invalid shape)
        ├─ parseGoal(goal)            → ParsedGoal (LLM or keyword fallback)
        ├─ getAllUsers() + resolveJobs()  → UserWithJobs[] (cached datasets)
        └─ buildWeb({ viewerUserId, parsedGoal, candidates })
              → { nodes: WebNode[], edges: WebEdge[] }
  ◄─ response seeds the canvas (Zustand seedWeb / setGoal)
```
`buildWeb` runs the 8-step ranking: score → take top ≤5 first-degree (≥40) →
attach ≤3 second-degree per node (≥70 + shared skill/company) → emit solid/dotted edges.

### B. Node click → profile + shared context + AI tip (W3)
```
click node
  └─► GET /api/user/[userId]  → UserWithJobs (job_history resolved)
        ⚠ payload includes salary_range; consumer MUST strip it before render/LLM
  └─► getSharedContext(viewer, target)  → SharedContext[] (school/company/skill/location)
  └─► POST /api/node/talking-points  { goalRaw, viewerSummary, targetSummary, sharedContext }
        ├─ zod validates body
        └─ generateTalkingPoint(...)  → { tip }
             ├─ LLM path: generateObject (AI SDK) bounded by 10s timeout
             ├─ salary terms scrubbed from every prompt field (defense in depth)
             └─ fallback: deterministic tip from the top shared-context entry
  ◄─ NodeSidebar renders the tip verbatim
```

### C. Goal + web → job matches (W4)
```
buildJobMatches(jobs, webUsers, goal)
  ├─ scoreJobAgainstGoal(job, goal)   → 0–100
  ├─ drop "weak" matches (never padded)
  ├─ findWebOverlap(job, webUsers)    → warm connections at that company
  ├─ sort by relevance; tie-break = more web connections first
  └─ cap at MAX_JOB_MATCHES (10)
  ◄─ JobsPanel renders cards, each linking back to a connection (opens W3 sidebar)
```

## 5. Cross-Cutting Behaviors

- **Graceful degradation:** every LLM-touching endpoint *never throws* — it falls
  back to deterministic logic when `OPENROUTER_API_KEY` is unset, the request times
  out, or the model returns unparsable output.
- **Salary hygiene:** salary data is part of the canonical dataset shape but must be
  stripped at the render/prompt boundary; `goalParser` and `talkingPoints` both
  regex-scrub `$amounts`, numeric ranges, and the word "salary" before prompting.
- **Idempotent web growth:** `addSecondDegreeNode` is idempotent on duplicate ids
  and only wires a bridge edge when the parent is already in the web.
- **Score domain:** node `interactionScore` / `relevanceScore` and edge `strength`
  travel on a `0–100` scale and are clamped on every mutation.
