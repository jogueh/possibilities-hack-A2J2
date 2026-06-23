# Workflow 2 — Backend AI Services / API Layer

## Problem & Approach

Workflow 2 owns the **server-side** of LinkedIn Web — **all API and AI endpoints live here**:

1. Fetching + caching the three static datasets (`user_data`, `jobs_data`, `course_data`) from `https://pit.najera.cc/*.json`
2. Pure-function utilities for resolving users + their job histories
3. An LLM-backed goal parser (with a fully working non-LLM fallback)
4. AI-drafted talking-points generation
5. Three HTTP routes:
   - `POST /api/web/generate` — consumed by W1
   - `GET /api/user/[userId]` — consumed by W3 (sidebar) and W4 (career timeline)
   - `POST /api/node/talking-points` — consumed by W3 (sidebar AI tip callout)

W2 explicitly **does not own** the pure scoring functions (`scoreUserAgainstGoal`, `deriveAlignmentTier`, `deriveActivityStatus`) — those have no I/O and are owned by **W4** at `src/lib/scoring.ts`. W2 imports them; while W4 hasn't merged that module yet, W2 ships a MOCK at the same path.

All of this ships **independently** of W1/W3/W4. To keep that independence safe while W1 hasn't merged its shared `src/types/web.ts` yet, W2 ships a **clearly-labeled MOCK** of that file using the exact symbol names from the W1 spec — when W1 lands, the file is a clean swap (the cross-workflow stubbing convention already established in this repo). The same approach applies to `src/lib/scoring.ts` until W4 lands the real implementation.

The work is split into **5 sequential PRs**. Each PR is shippable on its own, has its own unit tests, and leaves the next PR with a green build.

---

## Approach Decisions (confirmed)

| Decision | Choice |
|---|---|
| Data source | Fetch from `https://pit.najera.cc/*.json` with `{ cache: 'force-cache' }` (no revalidation — static dataset) |
| Test runner | Vitest (per W1 spec) — `node` env for the lib + route tests |
| LLM stack | Vercel AI SDK (`ai`) + `@openrouter/ai-sdk-provider`, model `meta-llama/llama-3.3-70b-instruct:free` (free OpenRouter tier; swap to a paid model if needed) |
| Cross-workflow types | MOCK `src/types/web.ts` matching W1's contract exactly, with a banner comment marking it as mock |
| Default viewer | `user_4579` (Bob Smith) when no `userId` provided, per scope |

---

## Identified Blockers / Risks (working independently)

These are the things that could trip W2 up while the other workflows are still in flight. Each has a mitigation:

| # | Blocker | Mitigation |
|---|---------|-----------|
| 1 | **`src/types/web.ts` is owned by W1 and not merged yet.** W2's API response shape depends on it. | Ship a MOCK file labeled with a `// MOCK — owned by W1, swap on merge` banner that re-exports the exact same symbol names. Drop-in replacement when W1 lands. |
| 2 | **`OPENROUTER_API_KEY` may not be set** locally or in CI. | `parseGoal()` falls back to deterministic keyword extraction. The endpoint never throws on missing key. Document in `.env.example`. |
| 3 | **Vitest, `ai`, and `@openrouter/ai-sdk-provider` aren't in package.json yet.** Adding deps could conflict with W1 if W1 lands first. | Add deps in PR 1 only after a `git pull --rebase` check; W1 lists the same packages in its scope so a merge there is a no-op in `package-lock.json`. |
| 4 | **W4 owns `src/lib/scoring.ts` (pure functions), and hasn't merged it yet.** W2's `/api/web/generate` consumes those functions. | Ship a MOCK `src/lib/scoring.ts` in PR 1 with a `// MOCK — owned by W4, swap on merge` banner. The MOCK can be a thin, deterministic placeholder (e.g. returns a fixed score based on name hash) — its only job is to make `/api/web/generate` runnable end-to-end during W2 development. PR 4's tests against the route inject a mocked scoring fn rather than relying on the MOCK behavior. |
| 5 | **Datasets are ~1.7 MB total.** Cold-start fetch latency on a Vercel-style serverless invocation could be noticeable. | `force-cache` means one fetch per server lifetime. Memoize JSON parsing in a module-level cache. Test with mocked fetch — never hit the real URL in tests. |
| 6 | **Next.js 16 + React 19** (the repo is on 16, the W1 spec says 15). | Pin Vitest + AI SDK to versions verified against Next 16 / React 19. No code-level impact for W2. |
| 7 | **Default viewer `user_4579` must exist in the dataset.** | Verified during plan exploration (it does — Bob Smith). Add a sanity-check log if `resolveUser('user_4579')` returns null at startup. |
| 8 | **`relevanceScore` must never reach the UI** (per W1 + W2 scope). It's on the wire though, so type-side leakage is the risk. | Document it in JSDoc on `WebNode.relevanceScore` and in route handler comments. No code enforcement needed; W1 owns the rendering side. |
| 9 | **Salary data must never appear in any LLM prompt or response.** | When building `targetSummary` for any LLM call (especially `/api/node/talking-points`), strip `salary_range` from the projected job objects, and additionally regex-scrub `$`, `salary`, and numeric `xxxxx–xxxxx` patterns from the incoming `targetSummary` string as defense-in-depth. Unit-tested. |

---

## PR Breakdown

Each PR has one clear scope, leaves the build green, and ships its own unit tests.

### PR 1 — Foundations: Vitest + Types + Raw Data Layer

**Goal:** Land the testing infra, the raw dataset types, the MOCK `web.ts`, and `src/lib/data.ts` with the four resolution helpers.

**Files added:**
- `vitest.config.ts` — `environment: 'node'`, `globals: true`, alias `@/* → src/*`
- `src/types/data.ts` — `User`, `Job`, `Course`, `UserWithJobs` raw shapes
- `src/types/web.ts` — **MOCK** of W1's contract (banner-commented), exporting `WebNode`, `WebEdge`, `GoalQuery`, `WebSnapshot`, `AlignmentTier`, `WebState`, `DegreeLevel`
- `src/lib/data.ts` — `fetchUsers()`, `fetchJobs()`, `fetchCourses()` + `getAllUsers()`, `resolveUser(id)`, `resolveJobs(ids)`, `resolveUserWithJobs(id)`
- `src/lib/scoring.ts` — **MOCK** of W4's contract (banner-commented), exporting `scoreUserAgainstGoal`, `deriveAlignmentTier`, `deriveActivityStatus` with stable, deterministic placeholder behavior so PR 4 has something to wire up. No unit tests on the MOCK (W4 owns the real tests).
- `src/lib/data.test.ts` — mocks `globalThis.fetch`, asserts shape + resolution + null on unknown id
- `.env.example` — adds `OPENROUTER_API_KEY=`
- `package.json` — `test`, `test:watch`, `test:ui` scripts; deps `vitest`, `@vitest/ui`

**Unit tests:**
- `resolveJobs` returns records for given ids; ignores unknown ids
- `resolveUser` returns `null` for unknown id
- `resolveUserWithJobs` substitutes `job_history` (string[]) with `Job[]`
- Fetch helpers call `fetch` with `cache: 'force-cache'` and parse JSON

---

### PR 2 — Goal Parser (LLM + fallback)

**Goal:** Convert a raw goal string into a `ParsedGoal` via OpenRouter, with a hard fallback to keyword extraction when the LLM is unavailable.

**Files added:**
- `src/types/goal.ts` — `ParsedGoal` interface (`targetRole?`, `targetIndustry?`, `targetLocation?`, `intent`)
- `src/lib/goalParser.ts`
  - `parseGoal(raw: string): Promise<ParsedGoal>`
  - Path A (LLM): `generateObject` from `ai` with `zod` schema; model `meta-llama/llama-3.3-70b-instruct:free` via `@openrouter/ai-sdk-provider`
  - Path B (fallback): regex/keyword scan over known roles + industries + a known-city list extracted from the user dataset
  - 5-second timeout on the LLM call → fall back silently
- `src/lib/goalParser.test.ts`
- `package.json` — deps `ai`, `@openrouter/ai-sdk-provider`, `zod`

**Unit tests:**
- Fallback path: `"break into SWE in Mountain View"` → `targetRole: 'Software Engineer'`, `targetLocation: 'Mountain View'`
- Fallback path: empty / nonsense input → still returns a valid `ParsedGoal` with `intent: raw`
- LLM path: mocked `generateObject` returns expected shape (no real network)
- LLM path: thrown error → falls back to keyword extractor (assert fallback was used)
- Salary data is never put into the prompt (assert prompt body doesn't contain `salary`)

**Depends on:** PR 1 (types).

---

### PR 3 — `POST /api/web/generate`

**Goal:** Stitch goal parser + scoring (imported from W4 MOCK) + dataset together. The headline endpoint W1 consumes.

**Files added:**
- `src/app/api/web/generate/route.ts`
  - `POST` handler: `{ goal: string, userId?: string }` → `{ nodes: WebNode[], edges: WebEdge[] }`
  - 8-step algorithm exactly as in the scope
  - Imports `scoreUserAgainstGoal`, `deriveAlignmentTier`, `deriveActivityStatus` from `@/lib/scoring` (W4 owns; MOCK lands in PR 1)
  - Center node id `'self'`; 1st-degree node ids `'node-1-<userId>'`; 2nd-degree `'node-2-<userId>'`
  - Positions are emitted as `{ x: 0, y: 0 }` (W1 owns layout — never compute positions server-side)
- `src/app/api/web/generate/route.test.ts`
- `src/lib/webBuilder.ts` (optional split if route gets too large) — pure builder used by the handler so the unit test can hit it without going through `Request`/`Response`. **Tests inject a mock scoring function** rather than depending on the W4 MOCK's behavior.

**Unit tests:**
- Returns ≤ 5 1st-degree nodes (with mocked scoring that returns predictable scores)
- Returns fewer when < 5 candidates clear score ≥ 40 (no padding)
- Excludes the requesting `userId` from the candidate pool
- 2nd-degree nodes only emitted when scoring ≥ 70 AND share ≥ 1 skill or company with the 1st-degree parent
- 2nd-degree edges have `isDotted: true`, 1st-degree edges have `isDotted: false`
- All edges have `strength: 50`
- Response shape conforms to MOCK `WebNode[]` / `WebEdge[]` types
- `parseGoal` failures don't break the endpoint — fall back to keyword path

**Depends on:** PR 1, 2.

---

### PR 4 — `GET /api/user/[userId]`

**Goal:** Resolve a full `UserWithJobs` payload for W3's sidebar and W4's career timeline.

**Files added:**
- `src/app/api/user/[userId]/route.ts`
  - `GET` handler: resolves via `resolveUserWithJobs`; returns 404 with `{ error: 'User not found' }` if null
- `src/app/api/user/[userId]/route.test.ts`

**Unit tests:**
- Returns full `UserWithJobs` for a valid id
- Returns 404 + error body for an unknown id
- `job_history` is fully resolved to `Job[]` (not a `string[]`)
- Salary data IS present on the raw response (consumers strip it before render — confirmed with W3 scope) — assert it exists and add a TODO comment noting W3 must filter it (it's the contract boundary)

**Depends on:** PR 1.

---

### PR 5 — `POST /api/node/talking-points`

**Goal:** AI-generated 1–2 sentence outreach opener for the W3 sidebar. **All LLM logic lives here in W2** — W3 only sends the payload and renders `{ tip }`.

**Files added:**
- `src/types/talkingPoints.ts` — request/response interfaces
- `src/lib/talkingPoints.ts`
  - `generateTalkingPoint(req): Promise<{ tip: string }>` — pure-ish (LLM-mocked in tests)
  - `scrubSalary(text: string): string` — strips `$`, `salary`, `<num>–<num>` patterns from incoming free-text fields
  - LLM path: `generateObject` from `ai` with a `{ tip: z.string() }` zod schema; model `meta-llama/llama-3.3-70b-instruct:free` via the same `@openrouter/ai-sdk-provider` client used by `goalParser.ts` (factor the client into `src/lib/openrouter.ts` during this PR)
  - Fallback: deterministic string `Mention your shared background in <topSharedLabel>.` (or `"...in your industry."` if no shared context)
  - 5-second timeout → fallback
- `src/app/api/node/talking-points/route.ts`
  - `POST` handler: validates body with zod, calls `generateTalkingPoint`, returns `{ tip }`
  - On malformed body → 400 with `{ error }`
- `src/lib/talkingPoints.test.ts`
- `src/app/api/node/talking-points/route.test.ts`
- (Refactor) Extract `createOpenRouterClient()` from `goalParser.ts` into `src/lib/openrouter.ts` so both endpoints share it. Update PR 3 imports — covered by PR 3's existing tests.

**Unit tests:**
- LLM path returns `{ tip }` matching the zod schema (mocked `generateObject`)
- LLM error → deterministic fallback string used
- LLM timeout (>5s, mocked with fake timers) → deterministic fallback
- `scrubSalary` removes `$120,000`, `salary range: 50000–80000`, and the literal word `salary` (case-insensitive)
- Handler returns 400 on a body missing `goalRaw` or `targetSummary`
- Handler does NOT include the request's `targetSummary` verbatim in the prompt if the scrub would remove parts — assert the prompt passed to `generateObject` is the scrubbed version

**Depends on:** PR 1 (types), PR 2 (OpenRouter client to share).

---

## Notes & Considerations

- **Module-level cache.** Use `let _users: User[] | null = null` patterns inside `src/lib/data.ts` so parsed JSON isn't re-parsed on every request. Reset hooks for tests.
- **Determinism in tests.** Always mock `fetch` and the AI SDK — never reach the network. Use `vi.spyOn(globalThis, 'fetch')` and `vi.mock('ai')`.
- **`relevanceScore` on the wire but not in UI.** W2's responsibility ends at putting the right number in the payload. W1 owns the "never render this" rule.
- **Salary data hygiene.** PR 4 (`/api/user/[userId]`) must call out in code comments that consumers strip salary on the raw user payload. PR 5 (`/api/node/talking-points`) is the highest-risk path because text reaches an LLM — that route has its own `scrubSalary` helper plus required upstream stripping from W3.
- **No course features in W2.** Per scope, course recommendations are post-MVP. PR 1 still fetches the courses dataset (for completeness + to seed the cache), but no helpers consume it yet.
- **No course endpoint in W2 scope.** Courses dataset stays loaded but unused by W2's API surface; W4-future-stretch may consume it.
- **All endpoints are stateless.** No DB, no session storage, no auth middleware. `userId` is trusted.
- **Co-author trailer** on each PR commit message:
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

---

## SQL Todo Mapping

Each PR above maps to one top-level todo, with dependencies wired so PR 2 (goal parser) unblocks PR 3 (`/api/web/generate`) and PR 5 (`/api/node/talking-points`); PR 1 unblocks everything.
