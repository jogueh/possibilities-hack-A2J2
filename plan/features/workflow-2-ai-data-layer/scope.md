# Workflow 2 — Data Layer + AI Goal Parser API

## Owner
This workflow owns everything server-side: fetching and caching the three datasets, the data resolution utilities, and the AI-powered `/api/web/generate` endpoint that transforms a user goal into a ranked `WebNode[]` + `WebEdge[]` graph payload.

---

## Data Sources (no auth required, CORS open)
```
https://pit.najera.cc/user_data.json   — 2,000 user profiles
https://pit.najera.cc/jobs_data.json   — job postings
https://pit.najera.cc/course_data.json — learning courses
```

These are **static, immutable hackathon datasets**. They never change, so all three are fetched once with `{ cache: 'force-cache' }` and no revalidation period — there is nothing to refresh.

### User record shape
```ts
{
  id: string
  name: string
  school_history: { school_name: string; degree: string; graduation_year: number }[]
  job_history: string[]        // array of job IDs → resolve via jobs dataset
  current_location: string
  posts_activity: string[]     // volume used to derive activityStatus
  skills: string[]
  courses: string[]
}
```

### Job record shape
```ts
{
  id: string
  company: string
  location: string
  position: string
  salary_range: { from: string; to: string }
  industry: string
  level: string                // "Entry" | "Mid" | "Senior"
  easy_apply: boolean
  description: string
}
```

---

## Features in Scope

### 1. Data Fetching + Server-Side Cache (`src/lib/data.ts`)
- Fetch all three datasets at server startup using Next.js `fetch` with `{ cache: 'force-cache' }` — no `revalidate`, no TTL
- Export resolution helpers:
  - `resolveJobs(jobIds: string[]): Job[]`
  - `resolveUser(userId: string): User | null`
  - `resolveUserWithJobs(userId: string): UserWithJobs | null`
  - `getAllUsers(): User[]`
- Raw dataset types live in `src/types/data.ts` (separate from `web.ts`)

### 2. Relevance Scoring (`src/lib/scoring.ts`)
Pure function, no I/O, fully unit tested:
```ts
scoreUserAgainstGoal(user: UserWithJobs, parsedGoal: ParsedGoal): number // 0–100
```

Scoring weights:
| Signal | Points |
|--------|--------|
| Role/position keyword match | 35 |
| Industry match | 20 |
| Location match (city/state) | 20 |
| Skills overlap | 15 |
| Activity level (posts_activity.length) | 10 |

`activityStatus` derivation (stored on `WebNode`, used by W1 stretch + W3):
- `posts_activity.length >= 3` → `'active'`
- `posts_activity.length 1–2` → `'moderate'`
- `posts_activity.length === 0` → `'inactive'`

`alignmentTier` derivation (drives avatar ring color in W1):
- score 70–100 → `'strong'`
- score 40–69 → `'moderate'`
- score < 40 → `'weak'`

### 3. Goal Parser (`src/lib/goalParser.ts`)
```ts
interface ParsedGoal {
  targetRole?: string
  targetIndustry?: string
  targetLocation?: string
  intent: string
}

parseGoal(raw: string): Promise<ParsedGoal>
```
- Calls OpenRouter via Vercel AI SDK using structured JSON output mode
- Model: `openai/gpt-4o-mini` (cheap, fast, sufficient for extraction)
- Falls back to simple keyword extraction if OpenRouter is unavailable

### 4. `POST /api/web/generate`
**Request:** `{ goal: string; userId: string }`
**Response:** `{ nodes: WebNode[]; edges: WebEdge[] }`

**Algorithm:**
1. Parse goal → `ParsedGoal`
2. Load all users; resolve their job histories
3. Score every user against `ParsedGoal` (exclude requesting `userId`)
4. Sort descending; take **up to 5** candidates with score ≥ 40 (`'moderate'` or `'strong'` tier). If fewer than 5 qualify, return only those that do — **do not pad with weak matches**
5. Build `WebNode` with `degree: 1` for each
6. For each 1st-degree node, find 2nd-degree candidates from the remaining pool with score ≥ 70 (`'strong'` only) that also share at least one skill or company with the 1st-degree node. Take up to 3 per node. **If none meet the threshold, omit 2nd-degree for that node entirely**
7. Build edges: `center → 1st` (`isDotted: false`, `strength: 50`); `1st → 2nd` (`isDotted: true`, `strength: 50`)
8. Return `{ nodes, edges }`

### 5. `GET /api/user/[userId]`
Returns `UserWithJobs` for a given `userId`. Used by W3's sidebar. Returns 404 if not found.

---

## Unit Tests (Vitest)

| Test file | What it covers |
|-----------|---------------|
| `src/lib/scoring.test.ts` | Score = 0 for no overlap; score = 100 for full match; each weight contributes correctly; `alignmentTier` thresholds; `activityStatus` derivation |
| `src/lib/goalParser.test.ts` | Fallback keyword extraction when LLM unavailable; known goal strings produce expected `ParsedGoal` shape |
| `src/lib/data.test.ts` | `resolveJobs` returns correct records; `resolveUser` returns null for unknown id |
| `src/app/api/web/generate/route.test.ts` | Returns ≤ 5 nodes; returns fewer when < 5 qualify; 2nd-degree nodes only included when score ≥ 70; requesting userId excluded from results |

---

## Business Logic

- **`force-cache` with no revalidation** — the dataset is static and never changes; there is nothing to refresh.
- **No user authentication.** `userId` is trusted. Use `user_4579` as the default "logged-in" user if none provided.
- **Scoring is deterministic** — no randomness. Same goal + same dataset = same result every time.
- **The LLM only parses the goal.** All ranking is algorithmic — the LLM never picks connections.
- **Never return weak-tier (score < 40) nodes as 1st-degree connections.** Return fewer nodes rather than padding.
- **2nd-degree suggestions require strong alignment (score ≥ 70).** Irrelevant 2nd-degree connections are more harmful than none.
- **`relevanceScore` is in the payload but must never be rendered** anywhere in the UI.

---

## Out of Scope (do NOT implement here)

| What | Owned by |
|------|----------|
| Rendering any UI | W1, W3, W4 |
| React Flow canvas or node positioning | W1 |
| Profile sidebar / talking points UI | W3 |
| AI-generated talking points per connection | W3 |
| All stretch goals (goal proximity, activity status ring, streaks, badges, notes) | W4 |
| Course recommendation features | Post-MVP |
| Saving web snapshots to a DB | Post-MVP |
| Rate limiting or auth middleware | Post-MVP |
