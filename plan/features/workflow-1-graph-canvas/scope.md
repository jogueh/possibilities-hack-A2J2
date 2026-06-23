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
- Vitest + React Testing Library for unit tests
- OpenRouter via Vercel AI SDK (installed here, configured in W2)

---

## Design System — LinkedIn Light Mode
This product is built **on top of LinkedIn's visual language** — familiar to users, light mode only.

| Token | Value | Usage |
|-------|-------|-------|
| `--li-blue` | `#0A66C2` | Primary actions, active edges, CTA buttons |
| `--li-blue-hover` | `#004182` | Hover states |
| `--li-bg` | `#F3F2EE` | Canvas background (LinkedIn warm off-white) |
| `--li-surface` | `#FFFFFF` | Cards, panels, node backgrounds |
| `--li-border` | `#E0DED8` | Dividers, node outlines |
| `--li-text` | `#000000` | Primary text |
| `--li-text-secondary` | `#666666` | Secondary labels |
| `--li-green` | `#057642` | Connected/success states |

Node avatar rings use **goal-alignment color** (not activity status — that belongs to W4 stretch):

| Alignment tier | Color | Meaning |
|---------------|-------|---------|
| Strong (score 70–100) | `#0A66C2` (LinkedIn blue) | Highly relevant to your goal |
| Moderate (score 40–69) | `#F59E0B` (amber) | Somewhat relevant |
| Weak (score < 40) | `#9CA3AF` (grey) | Included to fill the web |

---

## Shared Contract — `src/types/web.ts`
**This file must be defined and merged before any other workflow writes UI against it.**

```ts
export type AlignmentTier = 'strong' | 'moderate' | 'weak'
export type WebState = 'empty' | 'seeded' | 'expanded'
export type DegreeLevel = 1 | 2

export interface WebNode {
  id: string               // React Flow node id
  userId: string           // links to dataset user id
  label: string            // display name
  degree: DegreeLevel      // 1st or 2nd connection
  avatarInitials: string   // fallback initials (no real photos in MVP)
  alignmentTier: AlignmentTier  // drives avatar ring color
  interactionScore: number // 0–100, starts at 0, updated by W4 stretch
  relevanceScore: number   // 0–100, computed by W2, never rendered in UI
  position: { x: number; y: number }
}

export interface WebEdge {
  id: string
  source: string           // WebNode id
  target: string           // WebNode id
  strength: number         // 0–100, starts at 50, updated by W4 stretch
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
- Configure Tailwind (with LinkedIn design tokens above), shadcn/ui, React Flow, Zustand, Framer Motion, Vitest
- Set up `src/types/web.ts` (shared contract above)
- Set up global Zustand store: `useWebStore` — holds `WebSnapshot`, exposes actions:
  `setGoal`, `seedWeb`, `expandWeb`, `resetWeb`, `updateInteractionScore(nodeId, edgeId, delta)`
- Top nav shell: LinkedIn-style white nav bar, logo left, user avatar right

### 2. State A — Empty Web
- Full-screen canvas (LinkedIn warm `#F3F2EE` background) with centered goal prompt card
- LinkedIn-style card: white surface, subtle border, blue CTA button
- Text input: "What's your career goal?" with example placeholder
- 2–3 static suggestion chips (e.g. "Break into SWE at a Bay Area startup") — pre-fill the input only, no API call
- Submit → transition to State B (calls `/api/web/generate`; stub with mock `WebNode[]` until W2 is ready)
- Loading state: pulsing skeleton nodes arranged radially on canvas

### 3. State B — First Connection Seed
- React Flow canvas renders `WebNode[]` and `WebEdge[]` from Zustand store
- Center node = logged-in user (fixed, non-draggable), styled as LinkedIn profile circle
- 1st-degree nodes arranged radially; avatar ring color reflects `alignmentTier`
- Solid LinkedIn-blue edges connecting center → 1st-degree nodes; animated on first render
- **Node count:** renders however many nodes W2 returns (1–5); no padding with empty nodes
- Node click → fires `onNodeClick(node: WebNode)` (wired to W3 sidebar; no-op stub until W3 ready)
- "New goal" button top-left → resets to State A with a confirmation modal

### 4. State C — Expanded Web
- Triggered by `expandWeb` action (dispatched by W4 Connect flow)
- 2nd-degree nodes rendered with **dashed** LinkedIn-border-colored edges
- "Goal proximity" pill in top bar: static placeholder % (scoring logic owned by W2)
- Right-click context menu on any node: "Hide node" (visually suppressed, not removed from store)
- "New goal" button remains accessible

### 5. Layout Algorithm (`src/lib/layout.ts`)
- Radial layout: center node at canvas midpoint, 1st-degree on inner ring, 2nd-degree on outer ring
- Recalculates positions when node list changes
- Exported as a pure function; **unit tested**

---

## Unit Tests (Vitest)

| Test file | What it covers |
|-----------|---------------|
| `src/lib/layout.test.ts` | Radial position calculation for 1, 3, 5 nodes; 2nd-degree outer ring placement |
| `src/store/webStore.test.ts` | State transitions (A→B→C), `resetWeb` clears snapshot, `updateInteractionScore` clamps at 100 |

---

## Business Logic

- **State machine is linear:** A → B → C. Going back to A always resets the full snapshot.
- **Canvas never fetches data.** Reads Zustand store only. All data loading is W2's responsibility.
- **Node positions are client-side only** — never in the API response.
- **Render however many nodes are returned** (up to 5). Do not create placeholder/empty nodes.
- **`relevanceScore` must never appear in any UI element** — not in tooltips, not in dev overlays.
- **2nd-degree nodes start locked** (reduced opacity, non-clickable) until unlocked by W4's connect action.

---

## Stretch Goals (implement only after core is complete)

- **Edge strength visuals:** custom `StrengthEdge` React Flow edge type — color/thickness tiers driven by `WebEdge.strength` (grey → indigo → violet → animated gradient)
- **Activity status ring:** secondary inner ring on avatar using `activityStatus` from W2 (`blue` = active, `amber` = moderate, `red` = inactive)

---

## Out of Scope (do NOT implement here)

| What | Owned by |
|------|----------|
| Fetching or scoring connection data | W2 |
| AI goal parsing or OpenRouter calls | W2 |
| Profile sidebar on node click | W3 |
| Talking points, shared context detection | W3 |
| Connect / message actions | W4 |
| 2nd-degree unlock logic | W4 |
| Streaks, badges, notes, met-up button | W4 stretch |
| Real LinkedIn OAuth or external auth | Never (out of MVP) |
| Mobile layout / responsive breakpoints | Post-MVP |
| Persisting web snapshots to a database | Post-MVP |
