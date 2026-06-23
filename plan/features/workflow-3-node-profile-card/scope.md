# Workflow 3 — Node Profile Card + Connection Intelligence

## Owner
This workflow owns everything that happens after a user clicks a node on the canvas. It renders a side panel with goal-relevant profile information, AI-generated talking points, shared context between the logged-in user and the connection, and the 2nd-degree connection preview/add mechanic.

---

## Dependencies
- Requires `WebNode` and `WebEdge` types from `src/types/web.ts` (W1)
- Reads from Zustand store (`useWebStore`) to get current goal and node data (W1)
- Calls `GET /api/user/[userId]` to resolve full profile (W2)
- Calls `POST /api/node/talking-points` (owned by this workflow, see below)
- Dispatches `addSecondDegreeNode(node: WebNode)` action to Zustand store (W1 must expose this action)

---

## Features in Scope

### 1. Side Panel Shell (`src/components/NodePanel.tsx`)
- Slides in from the right when a node is clicked; closes on outside click or X button
- Overlay does not obstruct the canvas (canvas remains pannable behind panel)
- Panel width: ~380px, full viewport height
- Sections rendered in order:
  1. Profile header
  2. Goal-relevant experience
  3. Shared context
  4. AI talking point
  5. 2nd-degree preview (only in State C or when user opts in)
- Loading skeleton while `GET /api/user/[userId]` is in flight
- Error state if user cannot be resolved

### 2. Profile Header
- Avatar initials circle (color matches `activityStatus` ring — **color logic defined by W4; use a prop/CSS class here, do not hardcode colors**)
- Full name + most recent job title + company (from resolved job history)
- Location badge
- Activity status label: "Very Active", "Somewhat Active", "Quiet" (maps from `activityStatus` field)

### 3. Goal-Relevant Experience (`src/lib/relevance.ts`)
```ts
filterRelevantJobs(jobs: Job[], parsedGoal: ParsedGoal): Job[]
```
- Show only jobs where `position` or `industry` overlaps with the goal's `targetRole` or `targetIndustry`
- If no overlap, show the 2 most recent jobs as fallback
- Display: company name, role, location, level badge (Entry / Mid / Senior)
- **Do not show salary data**

### 4. Shared Context Detection (`src/lib/sharedContext.ts`)
```ts
getSharedContext(viewer: UserWithJobs, target: UserWithJobs): SharedContext[]
```
Returns an array of talking-point seeds:
```ts
interface SharedContext {
  type: 'school' | 'company' | 'skill' | 'location'
  label: string   // e.g. "Both attended UC Berkeley"
}
```
Detection rules:
- **School:** same `school_name` in either user's `school_history`
- **Company:** same `company` appears in both users' resolved job histories
- **Skill:** intersection of `skills` arrays
- **Location:** same `current_location` city

Rendered as small chips in the panel. Max 3 chips shown; overflow hidden (not a scrollable list).

### 5. AI Talking Point (`POST /api/node/talking-points`)
**Request:**
```ts
{ goalRaw: string; viewerContext: string; targetSummary: string; sharedContext: SharedContext[] }
```
**Response:**
```ts
{ tip: string }  // 1–2 sentence actionable message suggestion
```
- Constructs a short LLM prompt: given the goal, the viewer's background, the target's relevant experience, and any shared context → generate one concrete outreach message suggestion
- Model: `openai/gpt-4o-mini` via OpenRouter
- Rendered in the panel as a highlighted callout card: "💬 Try saying: [tip]"
- If the API call fails or takes >5s → show static fallback: "Mention your shared interest in [top skill]."
- **One call per node open.** Do not re-call if the same node is re-opened (cache by `userId` in component state).

### 6. 2nd-Degree Connection Preview
- Shown as a collapsed section "People [Name] can introduce you to"
- Lists up to 3 2nd-degree nodes (already present in the store from W2's response)
- Each item: avatar initials, name, role, relevance reason (e.g. "Works at same company as your goal target")
- **"Add to web" button** per item:
  - Dispatches `addSecondDegreeNode(node)` to Zustand store
  - Unlocks the node on canvas (W1 handles the visual unlock)
  - Button changes to "Added ✓", disabled after click
- **Locking mechanic:** the section header shows a lock icon with label "Make the connection to unlock further" until `degree: 1` node has `interactionScore > 0` (W4 sets this). For MVP, the lock is purely visual — "Add to web" still works regardless.

---

## Business Logic

- **The panel is read-only from a graph perspective** — it never directly modifies `WebNode` or `WebEdge` data structures. It only dispatches named Zustand actions.
- **Goal context is always threaded through** relevance filtering and talking point generation. The panel must read `goal.raw` from the store — it must not ask the user to re-enter their goal.
- **Shared context detection is purely client-side** (pure function, no API call). Only the talking point tip requires a server round-trip.
- **The "logged-in" user's own profile data** must be fetched once on app load (not per panel open) and stored in Zustand as `viewerProfile`. W3 reads it; it is not W3's job to define the fetch timing.

---

## Out of Scope (do NOT implement here)

| What | Owned by |
|------|----------|
| Canvas rendering, node/edge layout | W1 |
| Connection scoring / ranking algorithm | W2 |
| `GET /api/user/[userId]` endpoint | W2 |
| Edge color / thickness styling | W4 |
| Activity ring color values/CSS | W4 |
| "I met up" button and interaction score updates | W4 |
| Streaks, badges | W4 |
| Public/private notes | W4 |
| Direct messaging (LinkedIn inbox) | Never (out of MVP) |
| Fetching real profile photos | Never (out of MVP) |
| Sending connection requests via LinkedIn API | Never (out of MVP) |
