# Workflow 4 — Connect & Outreach Flow

## Owner
This workflow owns the mechanics that move a connection from "suggested" to "active" — unlocking 2nd-degree nodes, logging real-world interactions, and maintaining the web's state over time. Gamification (streaks, badges, notes, edge strength) is explicitly **stretch** and should only be built after the core connect flow is complete.

---

## Dependencies
- `WebNode`, `WebEdge` from `src/types/web.ts` (W1)
- Zustand store actions: `addSecondDegreeNode`, `updateInteractionScore`, `expandWeb` (W1 exposes these)
- W3 sidebar leaves placeholder slots for the "I Met Up" button and notes icon — W4 provides those components
- W1 registers the `StrengthEdge` custom React Flow edge type (W4 provides the component as a stretch goal)

---

## Features in Scope (Core)

### 1. `addSecondDegreeNode` Zustand Action
Defined in `useWebStore` (W1 scaffolds the store; W4 implements this specific action):
```ts
addSecondDegreeNode(node: WebNode): void
```
- Appends the 2nd-degree `WebNode` to `snapshot.nodes`
- Adds a `WebEdge` from its parent 1st-degree node → new 2nd-degree node (`isDotted: true`, `strength: 50`)
- Transitions `snapshot.state` to `'expanded'` if not already
- Fires W1's `expandWeb` to trigger canvas re-layout

### 2. Unlock Mechanic
- 2nd-degree nodes start in a **locked visual state** (set by W1 via reduced opacity + `pointer-events: none`)
- A node is considered "unlocked" when `addSecondDegreeNode` is dispatched for it
- No additional unlock gating for MVP — clicking "Add to web" in W3's sidebar immediately unlocks

### 3. `updateInteractionScore` Zustand Action
```ts
updateInteractionScore(nodeId: string, edgeId: string, delta: number): void
```
- Increments `WebNode.interactionScore` and `WebEdge.strength` by `delta`, both capped at 100
- Used by the "I Met Up" button (core) and future interactions (stretch)

### 4. "I Met Up With This Person" Button (`src/components/MetUpButton.tsx`)
- Rendered inside W3's sidebar in the Actions bar, below Connect / Message
- LinkedIn-style secondary button: "✓ We met up"
- On click:
  - Calls `updateInteractionScore(nodeId, edgeId, 20)`
  - Shows toast: "🤝 Connection logged!"
  - Button label changes to "Logged today ✓" and disables for the rest of the session (no localStorage needed for MVP — session memory only)
- Does not require any API call

### 5. Re-query / Reset Flow
- "New goal" button (rendered by W1, wired here) triggers a confirmation modal:
  - "Start a new web? Your current connections will be cleared."
  - Confirm → calls `resetWeb()` → returns to State A
  - Cancel → dismisses modal, no change
- Web state is **not persisted between page reloads** for MVP

---

## Unit Tests (Vitest + React Testing Library)

| Test file | What it covers |
|-----------|---------------|
| `src/store/connectActions.test.ts` | `addSecondDegreeNode` appends node + edge; transitions state to `'expanded'`; does not duplicate nodes if called twice with same id |
| `src/store/interactionScore.test.ts` | `updateInteractionScore` clamps at 100; negative delta not applied (floor at 0); correct node and edge updated by id |
| `src/components/MetUpButton.test.tsx` | Button renders; on click dispatches correct action with delta 20; disables after first click within session |

---

## Business Logic

- **W4 never directly mutates `WebNode[]` or `WebEdge[]` outside of Zustand actions.** All state changes go through the store.
- **`updateInteractionScore` is the only write path for `interactionScore` and `strength`.** No other workflow modifies these fields.
- **The "I Met Up" button is session-only for MVP** — no localStorage, no API persistence. Refresh = reset.
- **`addSecondDegreeNode` is idempotent** — calling it twice with the same node id must not create duplicate nodes or edges.
- **The re-query modal must not auto-submit** — it always requires explicit user confirmation.

---

## Stretch Goals (implement only after core is complete)

These are gamification features. Sprinkle in after the connect flow is stable:

### 🔗 Edge Strength Visuals (`src/components/StrengthEdge.tsx`)
Custom React Flow edge type driven by `WebEdge.strength`:
| Strength | Color | Thickness | Pulse |
|----------|-------|-----------|-------|
| 0–25 | `#E0DED8` (LinkedIn border grey) | 1px | No |
| 26–50 | `#0A66C2` (LinkedIn blue) | 2px | No |
| 51–75 | `#6366F1` (indigo) | 3px | Subtle |
| 76–100 | `#8B5CF6 → #EC4899` gradient | 4px | Yes |

### 🔥 Streaks (`src/lib/streaks.ts`)
- Any day the user opens the web or logs a meetup counts as an active day
- Persisted in `localStorage` under `web_streak`
- Rendered in top nav as 🔥 + streak count
- Pulse animation if streak is at risk

### 🏅 Badges (`src/lib/badges.ts`)
| Badge | Trigger |
|-------|---------|
| 🌱 First Seed | First web generated |
| 🕸️ Web Weaver | 3+ 2nd-degree nodes added |
| 🤝 Connector | 3+ meetups logged |
| 🔥 On Fire | 7-day streak |
| ⚔️ Connection Warrior | All 5 first-degree nodes have `interactionScore > 0` |

- Awarded client-side, persisted in `localStorage`
- New badge → confetti burst (`canvas-confetti`) + toast
- Earned badges shown as emoji icons in the nav dropdown

### 📝 Notes per Node
- Notes icon on each node; click → popover with 280-char textarea
- Private by default; persisted in `localStorage` under `note_[nodeId]`
- Filled dot indicator on the icon when a note exists

---

## Out of Scope (do NOT implement here)

| What | Owned by |
|------|----------|
| Canvas layout, node/edge base rendering | W1 |
| AI goal parsing or scoring | W2 |
| Profile sidebar shell and content | W3 |
| Connect / Message UI buttons | W3 |
| AI talking points | W3 |
| Activity status ring color values | W1 stretch |
| Server-side persistence of any kind | Post-MVP |
| Real LinkedIn connection requests | Never (out of MVP) |
| Push notifications for streaks | Post-MVP |
| Leaderboards or social badge sharing | Post-MVP |
