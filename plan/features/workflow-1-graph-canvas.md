# Workflow 1 — Graph Canvas

> Implementation plan for the interactive connection-graph canvas, the visual core of
> the "Career GPS / AI Networking Copilot" experience (goal → map → warm path → intro).

## 1. Objective

Render an interactive 2D "web" of people as nodes and relationships as edges. The canvas
is the surface every other workflow plugs into: a goal query seeds it, a scoring engine
ranks/positions nodes, and the intro-drafting flow is triggered from a selected node.

The canvas must move through three states:

- `empty` — no goal yet; quiet placeholder prompting the user to set a goal.
- `seeded` — a goal exists; 1st-degree (direct) connections are laid out around the user.
- `expanded` — a node was expanded, revealing its 2nd-degree connections with dotted edges.

## 2. Tech context (existing stack)

- Next.js `16.2.9` App Router, React `19`, TypeScript `5`.
- Ant Design `6` + `@ant-design/icons` `6` (icons force `"use client"` on importing modules).
- LinkedIn-inspired theme tokens in `src/theme.ts` (`colorPrimary: #0a66c2`).
- No graph/visualization library and **no test runner** are installed yet.
- Mock people live in `src/data/user_data.json`.

Decision: render with **inline SVG + React** (no new heavy graph dependency) to keep the
hackathon footprint small and the layout deterministic/testable.

## 3. Data model (`src/types/web.ts`)

The canvas is built around the shared types below. These are the contract other workflows
import, so this file ships first and is treated as a cross-workflow dependency.

```ts
export type AlignmentTier = 'strong' | 'moderate' | 'weak'
export type WebState = 'empty' | 'seeded' | 'expanded'
export type DegreeLevel = 1 | 2

export interface WebNode {
  id: string
  userId: string
  label: string
  degree: DegreeLevel
  avatarInitials: string
  alignmentTier: AlignmentTier
  interactionScore: number
  relevanceScore: number
  position: { x: number; y: number }
}

export interface WebEdge {
  id: string
  source: string
  target: string
  strength: number
  isDotted: boolean
}

export interface GoalQuery {
  raw: string
  userId: string
}

export interface WebSnapshot {
  state: WebState
  nodes: WebNode[]
  edges: WebEdge[]
  goal: GoalQuery | null
}
```

## 4. Scope of Workflow 1

In scope:

1. `src/types/web.ts` — shared types (above).
2. Pure layout/geometry helpers — radial placement of nodes, edge derivation, styling rules.
3. A presentational SVG canvas component that renders a `WebSnapshot`.
4. A stateful container that owns the `WebState` machine and selection/expand interactions.
5. A mock snapshot builder that turns `user_data.json` + a `GoalQuery` into a `WebSnapshot`.
6. A route/page to host the canvas (`/web`) wired into the existing layout.
7. Unit tests for the pure logic (layout, edge styling, state transitions, snapshot builder).

Out of scope (owned by sibling workflows — see §6):

- Goal capture UI + NLP parsing of the raw goal string (Workflow 2).
- The real relevance/interaction scoring engine (Workflow 3).
- AI-drafted double-opt-in intro composer (Workflow 4).

## 5. Component / module breakdown

- `src/types/web.ts` — types contract.
- `src/lib/web/layout.ts` — `layoutNodes()`, `deriveEdges()`, alignment→radius/color mapping.
  Pure, deterministic, framework-free (easy to unit test).
- `src/lib/web/snapshot.ts` — `buildSnapshot(goal, people, state)` producing a `WebSnapshot`;
  `expandNode(snapshot, nodeId)` returning the `expanded` snapshot with degree-2 nodes + dotted edges.
- `src/components/web/WebCanvas.tsx` — `"use client"`; presentational SVG renderer of a snapshot
  (nodes as circles + initials, edges as lines, dotted when `isDotted`, stroke width ∝ `strength`).
- `src/components/web/WebNodeMarker.tsx` — single node (avatar circle, label, tier color).
- `src/components/web/WebBoard.tsx` — `"use client"` container owning state machine + click-to-expand,
  empty-state prompt, and (temporary) goal stub input until Workflow 2 lands.
- `src/app/web/page.tsx` — route hosting `WebBoard`.

## 6. Cross-workflow dependencies

| Direction | Depends on / Provides | Detail |
|-----------|----------------------|--------|
| Provides  | `src/types/web.ts`   | Shared contract consumed by Workflows 2–4. Land first. |
| Consumes  | `GoalQuery` (WF2)    | WF2 produces the parsed goal; WF1 stubs it until then. |
| Consumes  | scoring (WF3)        | `relevanceScore`/`interactionScore` come from WF3; WF1 uses mock scores meanwhile. |
| Provides  | node selection event | WF4 intro composer is launched from a selected `WebNode`. |

Contract-first rule: `web.ts` and the `buildSnapshot`/`expandNode` signatures are frozen
early so sibling workflows can build against stable interfaces in parallel.

## 7. Step breakdown (each step = branch + PR + unit tests)

1. **types-web** — add `src/types/web.ts`. Provides the cross-workflow contract.
2. **layout-helpers** — `src/lib/web/layout.ts` (radial layout, edge derivation, tier styling) + tests.
3. **snapshot-builder** — `src/lib/web/snapshot.ts` (`buildSnapshot`, `expandNode`) + tests. Depends on 1, 2.
4. **canvas-render** — `WebCanvas` + `WebNodeMarker` SVG presentational components. Depends on 1, 2.
5. **board-state** — `WebBoard` state machine (empty→seeded→expanded), selection, goal stub. Depends on 3, 4.
6. **web-route** — `src/app/web/page.tsx` + nav entry. Depends on 5.

## 8. Testing approach

- No runner exists yet → add **Vitest** + `@testing-library/react` as devDependencies and a
  `test` script. Keep config minimal (jsdom for component tests, node for pure-logic tests).
- Prioritize pure-logic tests: layout determinism, edge dotted/strength rules, tier→color mapping,
  and the `empty → seeded → expanded` transitions of `buildSnapshot`/`expandNode`.
- Smoke-test `WebCanvas` renders the right number of `<circle>`/`<line>` elements for a snapshot.

## 9. Acceptance criteria

- `npm run build` and `npm run lint` pass.
- `npm test` passes (new Vitest suite).
- `/web` renders: empty state with prompt; seeding lays out degree-1 nodes radially; clicking a
  node expands degree-2 nodes connected by dotted edges; edge thickness reflects `strength`;
  node color reflects `alignmentTier`.
- `src/types/web.ts` exports exactly the interfaces/types specified in §3.
