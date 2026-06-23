# Workflow 3 — Node Profile Sidebar + Connection Intelligence

## Owner
This workflow owns the profile sidebar that opens when a user clicks a node — including the person's name, experience, commonalities with the viewer, outreach actions (message / connect), and the 2nd-degree preview list. It is the primary surface where AI-generated connection intelligence is surfaced.

---

## Dependencies
- `WebNode`, `WebEdge`, `GoalQuery` from `src/types/web.ts` (W1)
- Zustand store `useWebStore` — reads `goal`, `nodes`; calls no Zustand write actions (all writes go through W4)
- `GET /api/user/[userId]` to resolve full profile (W2)
- `POST /api/node/talking-points` (owned here)
- `viewerProfile: UserWithJobs` — fetched once on app load, stored in Zustand by W1; W3 reads it

---

## Features in Scope

### 1. Sidebar Shell (`src/components/NodeSidebar.tsx`)
- Slides in from the right on node click; closes via X button or outside click
- LinkedIn-style white panel, `#F3F2EE` header strip, subtle shadow
- Does not obstruct the canvas — canvas remains pannable behind the sidebar
- Fixed width: 380px, full viewport height
- Loading skeleton while `GET /api/user/[userId]` resolves
- Error state if user not found

Sections rendered top to bottom:
1. Profile header
2. Experience (goal-relevant)
3. Commonalities
4. AI talking point
5. 2nd-degree preview
6. Actions (Connect / Message)

### 2. Profile Header
- Avatar circle with initials (same `alignmentTier` ring color as the canvas node — import color constant from `src/lib/alignmentColors.ts` defined in W1)
- **Full name** (large, LinkedIn-weight)
- **Most recent job title + company** (resolved from job history)
- **Location**
- **Alignment label:** "Strong match for your goal" / "Moderate match" / "Weak match" — derived from `alignmentTier`

### 3. Experience — Goal-Relevant Filter (`src/lib/relevance.ts`)
```ts
filterRelevantJobs(jobs: Job[], parsedGoal: ParsedGoal): Job[]
```
- Show only jobs where `position` or `industry` overlaps with `targetRole` or `targetIndustry`
- Fallback: show 2 most recent jobs if no overlap
- Render each as a LinkedIn-style experience row: company, role, level badge (Entry / Mid / Senior), location
- **Do not show salary data under any circumstance**

### 4. Commonalities (`src/lib/sharedContext.ts`)
```ts
getSharedContext(viewer: UserWithJobs, target: UserWithJobs): SharedContext[]

interface SharedContext {
  type: 'school' | 'company' | 'skill' | 'location'
  label: string  // e.g. "Both attended UC Berkeley", "Both worked at Google"
}
```
Detection rules:
- **School:** matching `school_name` in either user's `school_history`
- **Company:** same `company` in both users' resolved job histories
- **Skill:** intersection of `skills` arrays
- **Location:** same city in `current_location`

Rendered as small LinkedIn-style chips. Show up to 3; hide overflow silently (no "show more"). If no commonalities found, hide the section entirely — do not show an empty state.

### 5. AI Talking Point (`POST /api/node/talking-points`)
**Request:**
```ts
{
  goalRaw: string
  viewerSummary: string    // viewer's top skills + most recent role
  targetSummary: string    // target's relevant experience
  sharedContext: SharedContext[]
}
```
**Response:** `{ tip: string }` — 1–2 sentence concrete outreach suggestion

- LLM prompt: given goal + viewer context + target experience + shared context → generate one specific message opener
- Model: `openai/gpt-4o-mini` via OpenRouter
- Rendered as a highlighted callout: `💬 Try: "[tip]"`
- Timeout: if no response in 5s → show static fallback: `"Mention your shared background in [top shared skill or school]."`
- **Cache per `userId`** in component state — do not re-call LLM on re-open of same node

### 6. 2nd-Degree Preview
- Section header: "People [Name] can introduce you to"
- Lists up to 3 pre-loaded 2nd-degree nodes from the Zustand store (already returned by W2)
- Each item: initials avatar, name, most recent role, brief alignment reason (e.g. "Also works in fintech")
- **Only shown if 2nd-degree nodes exist for this 1st-degree node** — omit section entirely if none qualify (W2 enforces the ≥ 70 score threshold; W3 trusts that list)
- "Add to web" button — dispatches `addSecondDegreeNode(node)` action (W4 owns this action; W3 calls it)
- Button becomes "Added ✓" (disabled) after click

### 7. Actions Bar (bottom of sidebar)
Two LinkedIn-style buttons, full width:
- **Connect** — opens a small confirmation modal: "Send [Name] a connection request?" → on confirm, shows success toast "Connection request sent to [Name]" (UI only, no real API call)
- **Message** — opens a minimal message composer modal: pre-filled subject from the AI talking point; textarea for body; "Send" button → success toast (UI only, no real API call)

---

## Unit Tests (Vitest + React Testing Library)

| Test file | What it covers |
|-----------|---------------|
| `src/lib/relevance.test.ts` | Returns goal-matched jobs; falls back to 2 most recent when no match; never includes salary data |
| `src/lib/sharedContext.test.ts` | Detects school/company/skill/location overlap correctly; returns empty array when no commonalities; deduplicates |
| `src/components/NodeSidebar.test.tsx` | Renders skeleton while loading; renders profile header with correct name/role; hides commonalities section when empty; "Added ✓" state after add-to-web click; connect modal appears on Connect click |

---

## Business Logic

- **Sidebar is read-only from a graph perspective** — it dispatches named Zustand actions only; it never mutates `WebNode` or `WebEdge` directly.
- **Goal context is always present** — the panel reads `goal.raw` from the store. It must never prompt the user to re-enter their goal.
- **Shared context detection is pure client-side** — no API call. Only the talking point requires a server round-trip.
- **Salary data must never appear** in any rendered output — not in experience rows, not in raw data passed to the LLM prompt.
- **Connect and Message are UI-only** — no real LinkedIn API calls. This is explicitly a demo surface.

---

## Out of Scope (do NOT implement here)

| What | Owned by |
|------|----------|
| Canvas layout, node/edge rendering | W1 |
| Connection scoring / ranking | W2 |
| `GET /api/user/[userId]` endpoint | W2 |
| All stretch goals (copy tip, deep link, edge strength, activity rings, met-up button, streaks, badges, notes) | W4 |
| Real LinkedIn OAuth or profile photos | Never (out of MVP) |
| Sending real connection requests or messages | Never (out of MVP) |
