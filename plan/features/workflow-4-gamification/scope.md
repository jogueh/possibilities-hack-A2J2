# Workflow 4 — Gamification + Link Dynamics + Activity System

## Owner
This workflow owns all the systems that make the web feel alive and reward meaningful engagement: edge strength visuals, activity status ring colors, streaks, badges, the "I met up" mechanic, and per-node notes. It is purely additive — it enhances existing nodes and edges; it never creates them.

---

## Dependencies
- Requires `WebNode`, `WebEdge` types from `src/types/web.ts` (W1)
- Reads and updates `interactionScore` on `WebEdge` and `WebNode` via Zustand actions (W1 must expose `updateInteractionScore(nodeId, delta)`)
- Reads `activityStatus` on `WebNode` (set by W2, never modified by W4)
- Node avatar component and panel header must accept an `activityStatus` prop for ring color (coordinated with W3)

---

## Features in Scope

### 1. Edge Strength Visual System
Edge appearance is driven by `WebEdge.strength` (0–100):

| Strength range | Color | Thickness | Animated pulse |
|---------------|-------|-----------|----------------|
| 0–25 | `#4B5563` (cool grey) | 1px | No |
| 26–50 | `#6366F1` (indigo) | 2px | No |
| 51–75 | `#8B5CF6` (violet) | 3px | Subtle |
| 76–100 | `#A855F7` → `#EC4899` gradient | 4px | Yes |

- Implemented as a custom React Flow `EdgeType` in `src/components/StrengthEdge.tsx`
- W1 registers this edge type in the React Flow config; W4 provides the component
- `isDotted: true` edges always render as dashed regardless of strength (2nd-degree connections)
- Strength transitions animate over 600ms using CSS transitions

### 2. Activity Status Ring Colors (`src/lib/activityColors.ts`)
```ts
export const ACTIVITY_RING: Record<ActivityStatus, string> = {
  active:   '#3B82F6', // blue-500  — "Reach out now"
  moderate: '#F59E0B', // amber-500 — "Worth a nudge"
  inactive: '#EF4444', // red-500   — "Cold — approach with context"
}
```
- Exported as a constant; consumed by W1's node renderer and W3's panel header
- Renders as a colored ring/border around the avatar circle
- Tooltip on hover: "Very Active — great time to reach out" / "Inactive — consider a shared context opener"
- **W4 defines colors and the constant. W1 and W3 import and use it. No one else defines avatar ring colors.**

### 3. "I Met Up With This Person" Button
- Rendered inside W3's NodePanel in a dedicated "Log Interaction" section (W3 leaves a placeholder slot for this)
- On click:
  - Increments `interactionScore` on the matching `WebEdge` by **+20** (capped at 100)
  - Increments `interactionScore` on the matching `WebNode` by **+10**
  - Dispatches `updateInteractionScore` Zustand action
  - Shows a brief toast: "🤝 Connection strengthened!"
  - Edge visually re-renders at new strength tier within 600ms
- **Rate-limited to once per 24h per node** (enforced via `localStorage` key `metup_[nodeId]_ts`; no server persistence needed for MVP)
- Button is disabled + shows "Logged today" if already used today

### 4. Streaks System (`src/lib/streaks.ts`)
Streak = any day the user either opens the web and views a connection OR logs a meetup.

```ts
interface StreakState {
  currentStreak: number    // consecutive days
  longestStreak: number
  lastActiveDate: string   // ISO date string
}

function recordActivity(): StreakState
function getStreakState(): StreakState
```
- Persisted in `localStorage` under key `web_streak`
- Rendered in the top nav as a 🔥 flame icon + number (e.g. "🔥 5")
- If streak is at risk of breaking (no activity yesterday), pulse animation on the flame icon
- **Streak counts days, not interactions.** Multiple actions in one day = 1 streak day.

### 5. Badges System (`src/lib/badges.ts`)
Badges are awarded client-side based on observable state. They persist in `localStorage` under `web_badges`.

| Badge ID | Name | Trigger |
|----------|------|---------|
| `first_seed` | 🌱 First Seed | First web generated |
| `web_weaver` | 🕸️ Web Weaver | 3+ 2nd-degree nodes added to web |
| `connector` | 🤝 Connector | 3+ meetups logged |
| `on_fire` | 🔥 On Fire | 7-day streak reached |
| `connection_warrior` | ⚔️ Connection Warrior | All 5 first-degree nodes have `interactionScore > 0` |

```ts
function checkAndAwardBadges(state: WebSnapshot, streaks: StreakState): Badge[]
// returns newly awarded badges since last check
```
- Called after any state mutation (meetup logged, node added, streak updated)
- New badge → full-screen confetti burst (use `canvas-confetti` library) + toast with badge name
- Badge shelf rendered in user profile area (top nav dropdown or side panel footer): shows earned badges as emoji icons with tooltip names
- Unearned badges are hidden (do not show locked/greyed out badges — no FOMO design)

### 6. Public/Private Notes per Node
- Small notes icon button on each node (rendered by W1, wired to W4's component)
- Click opens a popover with a textarea (max 280 chars)
- Two toggle modes: **Private** (default, stored in localStorage) / **Public** (stored in localStorage with a `public_` prefix — purely cosmetic for MVP, no real sharing)
- Persisted in `localStorage` under key `note_[nodeId]`
- Notes icon shows a filled dot indicator if a note exists for that node
- Notes are never sent to any API

---

## Business Logic

- **W4 never creates or removes nodes/edges.** It only reads and updates scores and renders enhancement components.
- **`activityStatus` is read-only from W4's perspective.** It is derived by W2 from `posts_activity` data and must never be overridden by interaction events.
- **`interactionScore` is the only field W4 writes.** It lives on `WebNode` and `WebEdge` and starts at `0`.
- **All persistence is `localStorage` only.** No server calls. This means state is per-browser and resets if localStorage is cleared — acceptable for hackathon MVP.
- **Badges are awarded, never revoked.** Once earned, a badge stays regardless of subsequent state changes.
- **The gamification layer must not alter the graph layout** (no repositioning nodes, no adding/removing from React Flow).

---

## Out of Scope (do NOT implement here)

| What | Owned by |
|------|----------|
| Canvas layout, node/edge rendering base | W1 |
| `updateInteractionScore` Zustand action definition | W1 |
| AI goal parsing or connection ranking | W2 |
| Talking points, shared context chip logic | W3 |
| NodePanel shell and profile data display | W3 |
| Deriving `activityStatus` from data | W2 |
| Server-side persistence of badges/streaks | Post-MVP |
| Social sharing of badges | Post-MVP |
| Leaderboards or comparative scoring | Post-MVP |
| Push notifications for streak reminders | Post-MVP |
| Real LinkedIn interaction data (actual message counts) | Never (out of MVP) |
