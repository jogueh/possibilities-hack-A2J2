# Workflow 3 — Manual Testing Plan

Step-by-step manual test script for **every W3 feature**. Pair this with the automated suite
(`npm test`, 33 tests). For architecture details see [`README.md`](./README.md).

---

## 0. Setup

```bash
npm install
npm run dev
```
Open **http://localhost:3000/w3-demo** — the W3 manual-testing harness. It seeds the mock
store with a goal (`"Break into software engineering"`), a viewer profile (Bob Smith), two
1st-degree nodes (Alice — strong, Bob — moderate), and one 2nd-degree node (Carol) connected
to Alice.

> **Note:** Without `OPENROUTER_API_KEY` set, the AI talking point shows the **static
> fallback** text — this is expected and is itself a valid test of the fallback path.

Optional — exercise the API directly:
```bash
curl -s -X POST http://localhost:3000/api/node/talking-points \
  -H "Content-Type: application/json" \
  -d '{"goalRaw":"break into SWE","viewerSummary":"analyst","targetSummary":"SWE at Google","sharedContext":[{"type":"school","label":"Both attended UC Berkeley"}]}'
```

---

## 1. Sidebar shell — open / close / states

| # | Steps | Expected result |
|---|-------|-----------------|
| 1.1 | Click **Alice Nguyen (strong)** | Sidebar slides in from the right (380px wide, full height), white panel with a `#F3F2EE` header strip. |
| 1.2 | Observe immediately after click | A loading **skeleton** appears briefly while the profile resolves. |
| 1.3 | Click the **✕** in the header | Sidebar closes. |
| 1.4 | Re-open Alice, then click anywhere **outside** the panel | Sidebar closes (canvas/page behind stays interactive — no blocking backdrop). |
| 1.5 | Click **Trigger error state** | Sidebar shows the **"User not found."** error state (no crash). |

---

## 2. Profile header

Open **Alice Nguyen**.

| # | Check | Expected |
|---|-------|----------|
| 2.1 | Avatar ring color | **LinkedIn blue** ring (Alice is `strong`). Open **Bob** instead → **amber** ring (`moderate`). |
| 2.2 | Name | "Alice Nguyen" in large bold. |
| 2.3 | Role + company | "Software Engineer · Google" (most recent job). |
| 2.4 | Location | "San Francisco, CA". |
| 2.5 | Alignment label | "**Strong match for your goal**" (Bob → "Moderate match"). |

---

## 3. Experience (goal-relevant, no salary)

Open **Alice Nguyen** (goal = "Break into software engineering").

| # | Check | Expected |
|---|-------|----------|
| 3.1 | Experience rows | Shows Alice's **Software Engineer · Google** role (matches the goal). |
| 3.2 | Level badge | "Senior" shown on the row. |
| 3.3 | **Salary** | **Never** displayed anywhere in the row. |
| 3.4 | Fallback (code path) | If a connection has no goal-matching jobs, the 2 most recent jobs are shown instead (covered by `relevance.test.ts`). |

---

## 4. Commonalities

| # | Steps | Expected |
|---|-------|----------|
| 4.1 | Open **Alice Nguyen** | "What you have in common" section shows chips — e.g. **Both attended UC Berkeley**, **Both worked at Google**, **Shared skill: Software Engineering** (viewer Bob shares these). Max 3 chips. |
| 4.2 | Open **Bob Smith** (viewer is also Bob in the harness — self/no overlap scenario) | Section is **hidden entirely** when there are no commonalities (no empty state). |

---

## 5. AI talking point

Open **Alice Nguyen**.

| # | Check | Expected |
|---|-------|----------|
| 5.1 | Callout | A highlighted blue callout: `💬 Try: "…"`. |
| 5.2 | No API key | Shows static fallback: `Mention your shared background in Software Engineering.` (or the shared school). |
| 5.3 | With `OPENROUTER_API_KEY` | Shows an LLM-generated 1–2 sentence opener. If the call exceeds 5s, the fallback appears. |
| 5.4 | **Caching** | Close Alice and re-open her → the tip appears immediately with **no new network call** (cached per `userId`; verify in the Network tab). |

---

## 6. 2nd-degree preview + add-to-web

Open **Alice Nguyen** (Carol is her 2nd-degree connection).

| # | Steps | Expected |
|---|-------|----------|
| 6.1 | Scroll to the 2nd-degree section | Header: "**People Alice Nguyen can introduce you to**", listing **Carol Lee** with initials avatar + alignment reason. |
| 6.2 | Open **Bob Smith** | Section is **omitted** (Bob has no 2nd-degree connections in the seed). |
| 6.3 | Click **Add to web** on Carol | Button changes to "**Added ✓**" and becomes disabled; `addSecondDegreeNode` is dispatched to the store. |
| 6.4 | Max items (code path) | At most **3** 2nd-degree nodes are listed (covered by `SecondDegreePreview.test.tsx`). |

---

## 7. Actions bar — Connect / Message

Open any node.

| # | Steps | Expected |
|---|-------|----------|
| 7.1 | Two full-width buttons at the bottom | **Connect** (blue filled) and **Message** (blue outline). |
| 7.2 | Click **Connect** | Modal: "Send Alice Nguyen a connection request?" with Cancel / Send. |
| 7.3 | Click **Send** in the Connect modal | Green success toast: "**Connection request sent to Alice Nguyen**" (auto-dismisses ~3s). No real API call. |
| 7.4 | Click **Message** | Composer modal opens; **Subject is pre-filled** from the AI talking point. |
| 7.5 | Type a body, click **Send** | Green toast: "**Message sent to Alice Nguyen**". No real API call. |
| 7.6 | Click **Cancel** or outside a modal | Modal closes with no toast. |

---

## 8. Automated coverage cross-reference

| Feature | Test file |
|---------|-----------|
| Mock scaffolding & store idempotency | `src/mocks/mocks.test.ts` |
| Experience relevance + salary stripping | `src/lib/relevance.test.ts` |
| Commonalities detection / dedupe / empty | `src/lib/sharedContext.test.ts` |
| Talking-point LLM path, fallback, timeout, no-salary | `src/app/api/node/talking-points/logic.test.ts` |
| Sidebar skeleton/header/commonalities/tip cache | `src/components/NodeSidebar.test.tsx` |
| 2nd-degree list / add-to-web / max-3 / omit | `src/components/SecondDegreePreview.test.tsx` |
| Connect/Message modals, subject prefill, toasts | `src/components/ActionsBar.test.tsx` |

Run all: `npm test` → **33 passing**.

---

## 9. Regression checklist before integration
- [ ] `npm test` green (33/33).
- [ ] `npm run lint` clean.
- [ ] `/w3-demo` exercises sections 1–7 with no console errors.
- [ ] Salary text appears **nowhere** in the sidebar.
- [ ] Re-opening a node does not re-call the talking-point API.
