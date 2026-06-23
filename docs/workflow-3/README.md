# Workflow 3 — Node Profile Sidebar + Connection Intelligence

Detailed documentation for everything in W3: what it does, how it is structured, the data
flow, the mock/real contracts, the API, and how to run it. For the step-by-step manual test
script, see [`MANUAL_TESTING.md`](./MANUAL_TESTING.md).

---

## 1. What W3 is

W3 owns the **profile sidebar** that opens when a user clicks a node on the networking
canvas. It is the primary surface where AI-generated *connection intelligence* is shown:

- **Profile header** — name, most-recent role/company, location, goal-alignment label, and an
  avatar ring colored by goal-alignment tier.
- **Experience** — only the connection's jobs that are relevant to the viewer's goal (salary
  never shown).
- **Commonalities** — shared school / company / skill / location, as chips.
- **AI talking point** — a 1–2 sentence outreach opener generated from goal + viewer + target
  + shared context.
- **2nd-degree preview** — people this connection can introduce you to, with "Add to web".
- **Actions bar** — Connect / Message (UI-only, no real LinkedIn calls).

---

## 2. Build context — why there are mocks

W3 was built **before** its upstream workflows (W1 app shell/store, W2 data + APIs, W4
graph actions) existed. To stay independently buildable and testable, every upstream
dependency is provided by a **clearly-labeled MOCK module** that reuses the *exact* symbol
names / API paths from the other workflow specs. Integration is therefore a clean
import-swap, not a rewrite. The swap checklist lives in the repo-root
[`INTEGRATION.md`](../../INTEGRATION.md).

> Every mock file begins with a banner: `// ⚠️ W3 MOCK — replace with W1/W2 real impl.`

---

## 3. File inventory

### W3-owned (canonical — keep at integration)
| File | Responsibility |
|------|----------------|
| `src/types/sharedContext.ts` | `SharedContext` type (school/company/skill/location). |
| `src/lib/relevance.ts` | `filterRelevantJobs(jobs, parsedGoal)` — pure, salary-stripped. |
| `src/lib/sharedContext.ts` | `getSharedContext(viewer, target)` — pure commonalities detection. |
| `src/lib/linkedinTokens.ts` | LinkedIn color/spacing tokens + `SIDEBAR_WIDTH` (mock of W1 design tokens). |
| `src/app/api/node/talking-points/logic.ts` | Talking-point generation logic (OpenRouter + fallback), testable. |
| `src/app/api/node/talking-points/route.ts` | `POST /api/node/talking-points` handler. |
| `src/components/NodeSidebar.tsx` | The sidebar shell + header + experience + commonalities + tip orchestrator. |
| `src/components/SecondDegreePreview.tsx` | 2nd-degree list + add-to-web. |
| `src/components/ActionsBar.tsx` | Connect / Message modals + toasts. |
| `src/components/CareerTimelineSlot.tsx` | Named placeholder where **W4** mounts `CareerTimeline`. |

### Mocks (⚠️ swap for real upstream at integration)
| Mock file | Stands in for | Owner |
|-----------|---------------|-------|
| `src/mocks/web.ts` | `src/types/web.ts` (`WebNode`, `WebEdge`, `GoalQuery`, `AlignmentTier`, …) | W1 |
| `src/mocks/data.ts` | `src/types/data.ts` (`User`, `Job`, `UserWithJobs`, `ParsedGoal`) | W2 |
| `src/mocks/alignmentColors.ts` | `src/lib/alignmentColors.ts` (ring colors + labels) | W1 |
| `src/mocks/useWebStore.ts` | `src/store/useWebStore.ts` (zustand) — `goal`, `nodes`, `edges`, `viewerProfile`, `addSecondDegreeNode` | W1 / W4 |
| `src/mocks/userApi.ts` | `GET /api/user/[userId]` → `fetchUserWithJobs` + fixtures | W2 |
| `src/mocks/goalParser.ts` | `parseGoal` (`parseGoalRaw`) | W2 |

### Test harness & tooling (⚠️ temporary)
| File | Purpose |
|------|---------|
| `src/app/w3-demo/page.tsx` | Manual-testing harness page (`/w3-demo`). Remove at integration. |
| `vitest.config.mts`, `vitest.setup.ts` | Vitest + RTL config (reconcile with W1 bootstrap). |

### Tests
`src/mocks/mocks.test.ts`, `src/lib/relevance.test.ts`, `src/lib/sharedContext.test.ts`,
`src/app/api/node/talking-points/logic.test.ts`, `src/components/NodeSidebar.test.tsx`,
`src/components/SecondDegreePreview.test.tsx`, `src/components/ActionsBar.test.tsx`
— **33 tests total**.

---

## 4. Data flow

```
node click ─▶ NodeSidebar(node)
                │
                ├─ useWebStore: goal, viewerProfile, nodes, edges, addSecondDegreeNode  (W1/W4 mock)
                ├─ fetchUserWithJobs(node.userId) ─▶ UserWithJobs            (W2 mock; real = GET /api/user/[id])
                │
                ├─ parseGoalRaw(goal.raw) ─▶ ParsedGoal                      (W2 mock; real = parseGoal)
                ├─ filterRelevantJobs(user.job_history, parsedGoal)          (W3, salary-stripped)
                ├─ getSharedContext(viewerProfile, user) ─▶ SharedContext[]  (W3, client-side)
                │
                ├─ POST /api/node/talking-points ─▶ { tip }                  (W3-owned; cached per userId)
                │
                ├─ SecondDegreePreview(node): edges→children, addSecondDegreeNode(child, node.id)
                └─ ActionsBar(name, tip): Connect/Message modals → toast (UI-only)
```

### Key rules enforced
- **Salary is never rendered or sent to the LLM.** `filterRelevantJobs` strips `salary_range`;
  `buildPrompt` only receives summaries (asserted in tests).
- **Sidebar is read-only to the graph** — it only *calls* `addSecondDegreeNode`; it never
  mutates `WebNode`/`WebEdge`.
- **Goal context is always present** — read from `goal.raw`; the panel never re-prompts.
- **Talking point is cached per `userId`** — re-opening the same node does not re-call the LLM.
- **Commonalities / 2nd-degree sections are omitted entirely when empty** (no empty states).

---

## 5. API — `POST /api/node/talking-points`

**Request**
```jsonc
{
  "goalRaw": "Break into software engineering",
  "viewerSummary": "Python, recent grad analyst",
  "targetSummary": "Senior Software Engineer at Google",
  "sharedContext": [{ "type": "school", "label": "Both attended UC Berkeley" }]
}
```

**Response**
```jsonc
{ "tip": "Hi Alice — saw we both studied at Berkeley; I'd love your advice on breaking into SWE." }
```

- Model: `openai/gpt-4o-mini` via OpenRouter (`OPENROUTER_API_KEY`).
- **5-second timeout** → static fallback: `"Mention your shared background in <skill|school>."`
- Falls back on missing key, non-OK response, timeout, or any error — so the endpoint always
  returns a usable `tip`.

---

## 6. Component contracts

### `NodeSidebar`
```ts
<NodeSidebar node={WebNode | null} onClose={() => void} />
```
`node = null` renders nothing (closed). Closes on the ✕ button or an outside click. Shows a
loading skeleton during fetch and an error state if the user is not found.

### `SecondDegreePreview`
```ts
<SecondDegreePreview parentNode={WebNode} parentName={string} />
```
Reads `nodes` + `edges` from the store, lists up to 3 `degree: 2` nodes connected to
`parentNode` via dotted edges, and calls `addSecondDegreeNode(child, parentNode.id)`.

### `ActionsBar`
```ts
<ActionsBar targetName={string} tip={string | null} />
```
Connect → confirm modal → success toast. Message → composer (subject pre-filled from `tip`)
→ success toast. No network calls.

### `CareerTimelineSlot` (W4 integration point)
```ts
<CareerTimelineSlot user={UserWithJobs} />
```
Empty placeholder rendered below Experience; **W4** replaces it with `CareerTimeline`.

---

## 7. Running & testing

```bash
npm install
npm test            # run all unit tests (vitest)
npm run test:watch  # watch mode
npm run lint        # eslint
npm run dev         # then open http://localhost:3000/w3-demo for the manual harness
```

> Without `OPENROUTER_API_KEY` set, the talking point shows the static fallback — expected.

---

## 8. Integration checklist (summary)

When W1/W2/W4 land, for each row in [`INTEGRATION.md`](../../INTEGRATION.md):
1. Replace `@/mocks/<x>` imports with the real path.
2. Delete the corresponding `src/mocks/<x>.ts`.
3. Replace `fetchUserWithJobs(id)` with `fetch('/api/user/' + id)`.
4. Remove the `src/app/w3-demo` harness and reconcile Vitest config with W1's bootstrap.
5. Run `npm test` — green confirms the contracts matched.

---

## 9. Out of scope (owned elsewhere)
Canvas/layout & node rendering (W1) · user scoring & `GET /api/user/[userId]` (W2) ·
`CareerTimeline` body & job overlap (W4) · all stretch goals — copy-tip, deep-link, met-up,
activity rings, streaks, badges, notes (W4).
