# Feature — Connection Depth (relationship journey)

## Why
LinkedIn rewards connection **count**. Our thesis is connection **depth** — authentic,
actionable relationships. This feature consolidates four product ideas (relationship
stages, helpfulness, hidden reputation, personalized challenges) into **one** mechanic:
each connection has a depth **stage** that the user advances through authentic actions.
Deeper relationships visibly strengthen the web and quietly make its suggestions smarter.

This **subsumes** the shipped "I met up with this person" feature: a logged meetup is
simply the first rung (Met) of the ladder. There is no standalone Met Up button anymore.

---

## Owner / Lanes touched
Primary: W4 (scoring) + W3 (sidebar). Necessarily touches W1 (`boardState`, `snapshot`,
canvas edge baseline) because the depth signal is expressed as edge strength. All edits
coordinated through small horizontal PRs (see PR Plan).

---

## The one mechanic

### Stages (3 rungs)
`Met → Collaborated → Advocate`

- Each 1st-degree connection has at most one stage (default: **none**).
- The user **self-advances** a connection up the ladder from the sidebar. No mutual
  confirmation (out of scope — needs a second live user; see Out of Scope).
- Advancing is monotonic forward in the demo (no downgrade UI required).

### Helpfulness tags (optional, per advance)
When advancing a stage, the user may attach one or more tags describing the value
exchanged — or **skip** (rating is always optional):
`Made an intro · Gave advice · Shared a resource · Mentored me`

### Hidden reputation → made visual
Stage + helpfulness are the "reputation" signal. They are **not** shown as a public
score or ranking. Instead they surface two ways:
1. **Edge thickening** — a connection's self-edge strength is driven by its stage:
   | Stage | Edge strength (0..1) | Look |
   |-------|----------------------|------|
   | _none_ (baseline) | `interactionScore * 0.22` (~0.07 at the default 0.30) | thin blue baseline |
   | Met | 0.40 | steady blue |
   | Collaborated | 0.65 | strong indigo + pulse |
   | Advocate | 0.90 | vibrant purple gradient + pulse |
   Un-staged 1st-degree edges render at a **lowered baseline** so progression is visible
   (compress natural `interactionScore` into the low range; preserves relative order).
2. **Suggestion re-rank** — deeper/more-helpful connections boost the ranking of the
   2nd-degree people reachable through them (their warm-path cluster surfaces first).

### Challenges strip
A small strip showing **1–2 gap-based nudges** derived from current stage state, e.g.:
- "Advance someone to **Collaborated**" (when nobody is past Met)
- "Meet someone **outside your field**" (no connection whose headline industry differs)
- "Turn a connection into an **Advocate**" (when ≥1 is at Collaborated)
Each nudge maps directly to a stage action. Clears/updates as the user acts.

---

## Storage
Session memory only, in `boardState` (mirrors the old `metUpIds` pattern):
- `stages: Record<personId, Stage>`
- `helpfulness: Record<personId, HelpfulnessTag[]>`
Resets on new goal / `submitGoal*`. No localStorage, no API, no persistence.

---

## Also in this stretch phase (independent)

### 🚀 Goal Proximity Job Boost — W4 jobs panel
If a job's company has **≥ 2** of the user's web connections (`webConnections.length >= 2`),
float that card into a **boosted tier** above all others, regardless of relevance.
- Boosted tier ordered by `relevanceScore` desc, then `webConnections.length` desc.
- Normal tier keeps the current relevance sort below it.
- Boosted cards show a badge: `⚡ N in your web`.
- Pure change in `jobMatches.ts` sort + a badge in `JobsPanel.tsx`. No cross-lane deps.

---

## Unit tests
- `boardState`: `setStage` advances stage + sets self-edge strength to the stage value;
  Met subsumes old meetup behavior; resets on new goal; idempotent; only affects the
  self↔person edge (not warm-path bridges). Helpfulness tags recorded/skippable.
- `snapshot`/baseline: un-staged 1st-degree self-edges render at the compressed baseline.
- StageStepper component: renders current stage, advances on click, shows/skips tags,
  controlled by `stage` prop threaded from boardState (resets on new goal).
- re-rank: a Collaborated/Advocate connection's children outrank an equivalent
  lower-stage connection's children.
- challenges: correct nudge chosen for representative stage states; empty when no gap.
- job boost: `relevance 60 + 2 conns` outranks `relevance 90 + 0 conns`; `1 conn` does
  NOT boost; boosted tier internal ordering; badge count correct.

---

## PR Plan (small, horizontal)
- **PR-A — Stage model (data layer):** `boardState` `stages`/`helpfulness` + `setStage`
  (subsumes `logMeetup`), stage→edge-strength map, lowered self-edge baseline in
  `snapshot`. Pure logic + tests. Foundation for B/C/D.
- **PR-B — StageStepper UI (W3 sidebar):** replaces `MetUpButton`; advance control +
  optional helpfulness chips; threads ActionsBar/NodeSidebar/WebBoard. Depends on A.
- **PR-C — Suggestion re-rank:** stage/helpfulness feeds warm-path ordering. Depends on A.
- **PR-D — Challenges strip:** gap-based nudges from stage state. Depends on A.
- **PR-E — Goal Proximity Job Boost:** independent, lands in parallel.

---

## Out of scope (do NOT implement here)
| What | Why |
|------|-----|
| Mutual confirmation between two real users | No second live user in demo; self-advance only |
| Public reputation scores / leaderboards | Reputation is hidden by design — only edge/re-rank |
| Persisting stages to DB or localStorage | Session memory only |
| Stage **downgrade** UI | Not needed for demo; monotonic forward |
| Streaks / badges / notes / bookmarks / filter bar | Separate stretch goals, deferred |
| Helpfulness affecting any global/cross-user metric | Single-player; session-local only |
