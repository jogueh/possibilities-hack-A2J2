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

### User record shape
```ts
{
  id: string               // "user_4579"
  name: string
  school_history: { school_name, degree, graduation_year }[]
  job_history: string[]    // array of job IDs → resolve via jobs dataset
  current_location: string
  posts_activity: string[] // activity strings used to derive activityStatus
  skills: string[]
  courses: string[]        // course IDs
}
```

### Job record shape
```ts
{
  id: string               // "job_550126"
  company: string
  location: string
  position: string
  salary_range: { from: string; to: string }
  industry: string
  level: string            // "Entry", "Mid", "Senior"
  easy_apply: boolean
  description: string
}
```

---

## Features in Scope

### 1. Data Fetching + Server-Side Cache (`src/lib/data.ts`)
- Fetch all three datasets at server startup using Next.js `fetch` with `{ cache: 'force-cache' }` (revalidate every 24h)
- Export resolution helpers:
  - `resolveJobs(jobIds: string[]): Job[]`
  - `resolveUser(userId: string): User | null`
  - `resolveUserWithJobs(userId: string): UserWithJobs | null` — joins job records onto user
- Export `getAllUsers(): User[]` for scoring pass
- Keep raw dataset types in `src/types/data.ts` (separate from `web.ts`)

### 2. Relevance Scoring (`src/lib/scoring.ts`)
Pure function, no I/O, fully testable:
```ts
scoreUserAgainstGoal(user: UserWithJobs, parsedGoal: ParsedGoal): number // 0–100
```
Scoring criteria (weighted):
- **Role/position keyword match** (job titles vs. goal target role) — 35 pts
- **Industry match** — 20 pts
- **Location match** (city/state string comparison) — 20 pts
- **Shared skills overlap** — 15 pts
- **Activity level** (derived from `posts_activity.length`) — 10 pts

`activityStatus` derivation:
- `posts_activity.length >= 3` → `'active'`
- `posts_activity.length === 1 or 2` → `'moderate'`
- `posts_activity.length === 0` → `'inactive'`

### 3. Goal Parser (`src/lib/goalParser.ts`)
```ts
interface ParsedGoal {
  targetRole?: string      // e.g. "software engineer"
  targetIndustry?: string  // e.g. "fintech"
  targetLocation?: string  // e.g. "Mountain View, CA"
  intent: string           // normalized free-text passed to LLM system prompt
}

parseGoal(raw: string): Promise<ParsedGoal>
```
- Calls OpenRouter via Vercel AI SDK with a **structured output / JSON mode** prompt
- System prompt instructs model to extract role, industry, location from free text
- Falls back to keyword extraction (no LLM) if OpenRouter is unavailable
- Model: `openai/gpt-4o-mini` via OpenRouter (cheap, fast, sufficient for extraction)

### 4. `POST /api/web/generate`
**Request:**
```ts
{ goal: string; userId: string }
```
**Response:**
```ts
{ nodes: WebNode[]; edges: WebEdge[] }
```

**Algorithm:**
1. Parse goal → `ParsedGoal`
2. Load all users; resolve their job histories
3. Score every user against `ParsedGoal` (exclude requesting userId)
4. Sort descending by score; take top 20 candidates
5. For each of the top 5 (1st-degree seed), build a `WebNode` with `degree: 1`
6. For each 1st-degree node, pick top 3 of the remaining candidates that share at least one skill or job company → build `WebNode` with `degree: 2`
7. Build edges:
   - `center → 1st-degree`: `isDotted: false`, `strength: 50` (initial default)
   - `1st-degree → 2nd-degree`: `isDotted: true`, `strength: 50`
8. Return `{ nodes, edges }`

**The requesting user's own node** is NOT included in the response — the canvas always renders it as the fixed center node from local state.

### 5. `GET /api/user/[userId]`
Returns `UserWithJobs` for a given userId. Used by W3's profile card to resolve full job history server-side. Accepts the `userId` path param, returns 404 if not found.

---

## Business Logic

- **No user authentication.** The `userId` in the request is treated as trusted (hackathon scope). Use `user_4579` as the default "logged-in" user if none is provided.
- **Scoring is deterministic** given the same goal and dataset. No randomness injected.
- **The LLM is only used for goal parsing.** The ranking/scoring is pure algorithmic — the LLM does not pick connections.
- **Top 5 first-degree nodes are fixed** in the response. The client-side toggle (1–5) shows/hides from this fixed set; it does not trigger a new API call.
- **relevanceScore is included in WebNode** but must never be rendered in the UI (W1, W3, W4 must not display it).

---

## Out of Scope (do NOT implement here)

| What | Owned by |
|------|----------|
| Rendering any UI | W1, W3, W4 |
| React Flow canvas or node positioning | W1 |
| Profile card / talking points UI | W3 |
| AI-generated talking points per connection | W3 |
| Interaction score updates (met up, chat) | W4 |
| Streaks, badges, notes persistence | W4 |
| Real LinkedIn API or OAuth | Never (out of MVP) |
| Course recommendation features | Post-MVP |
| Saving/persisting web snapshots to a DB | Post-MVP |
| Rate limiting or auth middleware | Post-MVP |
