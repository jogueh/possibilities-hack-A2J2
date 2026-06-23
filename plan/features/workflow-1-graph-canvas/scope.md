# Workflow 1 — App Shell + Graph Canvas + State Machine

## Owner
This workflow owns the foundational project setup, the React Flow canvas, the three web states, and all state transitions. Every other workflow mounts UI on top of or alongside this one.

---

## Stack Bootstrap (one-time, do first)
- Next.js 15 (App Router, TypeScript strict mode)
- Tailwind CSS + shadcn/ui component library
- React Flow (`@xyflow/react`) for the graph canvas
- Zustand for global web state
- Framer Motion for node/edge entrance animations
- OpenRouter via Vercel AI SDK (installed here, configured in W2)

---

## Shared Contract — `src/types/web.ts`
**This file must be defined and merged before any other workflow writes UI against it.**

```ts
export type ActivityStatus = 'active' | 'moderate' | 'inactive'
export type WebState = 'empty' | 'seeded' | 'expanded'
export type DegreeLevel = 1 | 2

export interface WebNode {
  id: string               // React Flow node id
  userId: string           // links to dataset user id
  label: string            // display name
  degree: DegreeLevel      // 1st or 2nd connection
  avatarUrl?: string       // optional profile pic
  avatarInitials: string   // fallback initials
  activityStatus: ActivityStatus
  interactionScore: number // 0–100, owned by W4
  relevanceScore: number   // 0–100, computed by W2, hidden from UI
  position: { x: number; y: number }
}

export interface WebEdge {
  id: string
  source: string           // WebNode id
  target: string           // WebNode id
  strength: number         // 0–100, driven by interactionScore, styled by W4
  isDotted: boolean        // true for 2nd-degree connections
}

export interface GoalQuery {
  raw: string              // user's free-text goal
  userId: string           // the logged-in user's id
}

export interface WebSnapshot {
  state: WebState
  nodes: WebNode[]
  edges: WebEdge[]
  goal: GoalQuery | null
}
```

> Other workflows must NOT modify this file without coordinating. Add fields only; never remove or rename.

---

## Features in Scope

### 1. Project Scaffold
- Initialize Next.js 15 project from scratch (replace existing codebase)
- Configure Tailwind, shadcn/ui, React Flow, Zustand, Framer Motion
- Set up `src/types/web.ts` (shared contract above)
- Set up global Zustand store: `useWebStore` — holds `WebSnapshot`, exposes actions `setGoal`, `seedWeb`, `expandWeb`, `resetWeb`
- Dark-mode-first design system (CSS variables for node colors, edge colors, accent gradients)
- Top nav shell: logo, user avatar placeholder, minimal navigation

### 2. State A — Empty Web
- Full-screen canvas with centered goal prompt card
- Text input: "What's your career goal?" with a short placeholder
- 2–3 AI-generated suggestion chips based on hardcoded seed hints (e.g. "Break into SWE at a Bay Area startup", "Find a mentor in product management") — chips just pre-fill the input, no AI call here
- Submit triggers transition to State B (calls `/api/web/generate` — stub with mock data until W2 is ready)
- Loading state: pulsing skeleton nodes on canvas while API call is in flight

### 3. State B — First Connection Seed
- React Flow canvas renders `WebNode[]` and `WebEdge[]` from the Zustand store
- Center node = the logged-in user (fixed, non-draggable)
- 1st-degree connection nodes arranged radially around center
- Solid animated edges connecting center → 1st-degree nodes
- **Toggle slider (1–5):** adjusts how many 1st-degree nodes are visible; re-runs layout without a new API call
- Node click → fires `onNodeClick` callback (wired to W3's panel; stub as no-op until W3 is ready)
- "New goal" button top-left → resets to State A with confirmation modal

### 4. State C — Expanded Web
- Triggered when user adds a 2nd-degree connection (action dispatched by W3)
- 2nd-degree nodes rendered with **dotted edges** connecting `center → 1st-degree → 2nd-degree`
- "Goal proximity" metric bar: static placeholder percentage label (actual scoring logic owned by W2)
- Can hide/show any node via right-click context menu (hidden nodes are not removed from store, just visually suppressed)
- "Save web" / "Discard & re-query" actions in top bar

### 5. Layout Algorithm
- Use React Flow's built-in `dagre` or manual radial positioning utility in `src/lib/layout.ts`
- Center node at canvas midpoint; 1st-degree nodes on inner ring; 2nd-degree on outer ring
- Recalculate positions when node count changes (toggle slider, add 2nd-degree)

---

## Business Logic

- **State machine is linear and one-directional:** A → B → C. Going back to A always resets the entire snapshot.
- **The canvas never fetches data directly.** It only reads from Zustand store. All data loading is W2's responsibility.
- **Node positions are computed client-side** from the layout utility; they are never stored in the API response.
- **The toggle slider (1–5) only filters visible nodes** — it does not re-rank or re-query. The full ranked list stays in the store.
- **2nd-degree nodes are locked** (greyed out, non-interactive) until the user explicitly adds them via W3's action.

---

## Out of Scope (do NOT implement here)

| What | Owned by |
|------|----------|
| Fetching or scoring connection data | W2 |
| AI goal parsing or OpenRouter calls | W2 |
| Profile card / side panel on node click | W3 |
| Talking points, shared context detection | W3 |
| Edge color/thickness based on interaction | W4 |
| Activity ring colors on avatars | W4 |
| Streaks, badges, notes | W4 |
| "I met up with this person" button | W4 |
| Real LinkedIn OAuth or external auth | Never (out of MVP) |
| Mobile layout / responsive breakpoints | Post-MVP |
| Persisting web snapshots to a database | Post-MVP |
