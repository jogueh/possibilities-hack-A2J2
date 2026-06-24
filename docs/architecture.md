# Architecture

> Persistent context for AI-assisted and human development. Reflects the code in
> `src/` as of this writing. Update when the stack, structure, or core logic changes.

## 1. Overview

This is a **Next.js (App Router) LinkedIn-style web app** built for the PIT
Hackathon. The product strategy is a warm-path **"Career GPS / AI Networking
Copilot"**: the user states a career goal, the app maps which 1st- and 2nd-degree
connections can help, scores their relevance, surfaces matching jobs, and drafts
AI outreach openers.

The codebase is organized around **four cooperating "workflows" (W1–W4)** that
share frozen TypeScript contracts:

- **W1 — Graph Canvas:** the interactive network web UI (`/web`).
- **W2 — AI / Data Layer:** goal parsing + dataset resolution + web generation API.
- **W3 — Node Sidebar:** per-connection profile + shared context + AI talking points.
- **W4 — Job Discovery & Scoring:** the shared scoring engine + job matching panel.

## 2. Tech Stack

### Frontend
- **Next.js `16.2.9`** (App Router, RSC) — `next.config.ts`, `src/app/`
- **React `19.2.4`** + **React DOM `19.2.4`**
- **TypeScript `^5`** (strict mode) — `tsconfig.json`
- **Ant Design `^6.4.5`** (`antd`) — primary component library
- **`@ant-design/icons` `^6.2.5`** — icon set (see the "use client" caveat below)
- **`@ant-design/nextjs-registry`** — SSR style injection for AntD in App Router
- **`next/font/google`** — Source Sans 3 font, wired in `src/app/layout.tsx`
- Styling: a single global stylesheet (`src/app/globals.css`) + AntD theme tokens
  (`src/theme.ts`). No Tailwind/CSS-modules.

### State management
- **Zustand `^5.0.14`** — the real cross-workflow store (`src/store/useWebStore.ts`).
- **`useSyncExternalStore` module store** — a labelled MOCK mirror of the Zustand
  selector API (`src/mocks/useWebStore.ts`), used by W3/W4 harnesses until swapped.
- **`useReducer` + pure reducer** — local state machine for the `/web` board
  (`src/components/web/boardState.ts`).

### Backend (Next.js Route Handlers)
- API routes under `src/app/api/**/route.ts` (Node runtime, RSC server code).
- **`zod` `^4.4.3`** — request-body validation in every POST handler.
- No database. Data comes from **three static JSON datasets** fetched over HTTP
  from `https://pit.najera.cc/*.json` (users, jobs, courses), cached in-module.

### AI / LLM
- **`ai` `^6.0.209`** (Vercel AI SDK) — `generateObject` for structured output.
- **`@openrouter/ai-sdk-provider` `^2.9.1`** — model provider, model id
  `openrouter/free` (`src/lib/openrouter.ts`).
- LLM calls are **optional & bounded**: skipped silently when `OPENROUTER_API_KEY`
  is unset, abort after `LLM_TIMEOUT_MS` (10s), and fall back to deterministic logic.

### Testing & tooling
- **Vitest `^4.1.9`** + **jsdom** + **Testing Library** (`vitest.config.ts`,
  `vitest.setup.ts`). Tests live next to source as `*.test.ts(x)`.
- **ESLint `^9`** with `eslint-config-next` (core-web-vitals + typescript presets).
- Scripts (`package.json`): `dev`, `build`, `start`, `lint` (`eslint .`),
  `test` (`tsc --noEmit && vitest run`), `test:watch`.
- Node engines: `^20.19.0 || ^22.13.0 || >=24.0.0`.

## 3. Directory Structure

```
src/
├── app/                      # Next.js App Router — pages, layout, API routes
│   ├── layout.tsx            # Root layout: AntdRegistry + ConfigProvider + TopNav
│   ├── page.tsx              # Home (/) — 3-column LinkedIn feed
│   ├── globals.css           # Global styles (only stylesheet)
│   ├── web/page.tsx          # /web — the real Network Web (W1 canvas)
│   ├── w3-demo/page.tsx      # Manual test harness for W3 NodeSidebar
│   ├── jobs-demo/page.tsx    # Manual test harness for W4 JobsPanel
│   ├── {network,jobs,messaging,notifications,me}/page.tsx  # Placeholder routes
│   └── api/                  # Route Handlers (backend)
│       ├── web/generate/route.ts        # POST: goal -> { nodes, edges }
│       ├── node/talking-points/route.ts # POST: context -> { tip }
│       └── user/[userId]/route.ts       # GET:  resolved UserWithJobs
├── components/               # UI components
│   ├── TopNav.tsx, Feed.tsx, ProfileCard.tsx, NewsPanel.tsx, ...  # Home/shell
│   ├── NodeSidebar.tsx, JobsPanel.tsx, ...                        # W3 / W4 UI
│   └── web/                  # W1 canvas: WebBoard, WebCanvas (SVG), boardState, markers
├── lib/                      # Core business logic (pure, testable)
│   ├── data.ts               # Static dataset fetch + resolution + in-memory cache
│   ├── goalParser.ts         # Free text -> ParsedGoal (LLM + keyword fallback)
│   ├── scoring.ts            # Weighted relevance scoring engine (W4-owned)
│   ├── webBuilder.ts         # 8-step ranking -> { nodes, edges }
│   ├── jobMatches.ts         # Rank jobs against goal + web overlap
│   ├── talkingPoints.ts      # AI outreach opener (LLM + deterministic fallback)
│   ├── sharedContext.ts      # Viewer/target commonalities detection
│   ├── openrouter.ts         # Shared OpenRouter/AI-SDK client + key/timeout config
│   └── web/                  # layout.ts, snapshot.ts — pure SVG layout + snapshot
├── store/useWebStore.ts      # REAL Zustand cross-workflow store
├── mocks/                    # ⚠️ Labelled MOCK data/types/api for unbuilt deps
├── data/                     # Local mock data (profile, posts, news, web_people)
├── types/                    # Shared TypeScript contracts (web, data, goal, job, ...)
├── test/                     # Shared test fixtures + cross-type tests
└── theme.ts                  # Ant Design theme tokens (LinkedIn palette)
```

### Folder purposes
- **`app/`** — routing + server entrypoints. Pages are RSC by default; interactive
  pages/components opt in with `"use client"`. `api/**/route.ts` are the backend.
- **`components/`** — presentational + interactive UI. `components/web/` holds the
  W1 canvas (a plain **SVG** renderer, not a graph library).
- **`lib/`** — the heart of the business logic. Everything here is **pure and
  deterministic** (no React), so it is exhaustively unit tested.
- **`store/`** — the real Zustand global store (cross-workflow source of truth).
- **`mocks/`** — clearly labelled mock modules that reuse the exact symbol names
  and API paths of unbuilt upstream workflows, kept separate so the integration
  swap is a one-line import change.
- **`data/`** — hard-coded local mock content for the Home shell + `/web` demo.
- **`types/`** — frozen cross-workflow contracts. Treat as a stable interface.

## 4. Where the Core Logic Lives

### Business logic — `src/lib/`
All ranking, scoring, parsing, and matching is pure and lives in `lib/`:
- **Scoring engine** (`lib/scoring.ts`): `scoreUserAgainstGoal` and
  `scoreJobAgainstGoal` return `0–100` from weighted signals
  (`WEIGHTS = role 35 / industry 20 / location 20 / skills 15 / activity 10`).
  `deriveAlignmentTier` buckets scores into `strong | moderate | weak`.
- **Web builder** (`lib/webBuilder.ts`): the documented 8-step algorithm —
  score candidates, take up to `FIRST_DEGREE_MAX (5)` with score ≥ `40`, attach up
  to `SECOND_DEGREE_PER_NODE_MAX (3)` 2nd-degree nodes (score ≥ `70` and sharing a
  skill/company), emit solid (1st) and dotted (2nd) edges.
- **Goal parsing** (`lib/goalParser.ts`): LLM path (structured JSON via the AI SDK)
  with a deterministic keyword-vocabulary fallback. Scrubs salary terms before any
  prompt.
- **Job matching** (`lib/jobMatches.ts`): scores jobs, drops weak matches, sorts by
  relevance with web-overlap as the tie-break, caps at `MAX_JOB_MATCHES (10)`.
- **Data layer** (`lib/data.ts`): fetches the three static datasets with
  `cache: 'force-cache'`, memoizes them in module-level maps, and resolves a
  `User.job_history` (string ids) into full `Job[]` (`UserWithJobs`).

### API routing — `src/app/api/`
Thin Route Handlers that validate input (zod) and delegate to `lib/`:
- `POST /api/web/generate` → `parseGoal` + `getAllUsers`/`resolveJobs` + `buildWeb`
  → `{ nodes, edges }`. Default viewer `user_4579`.
- `POST /api/node/talking-points` → `generateTalkingPoint` → `{ tip }` (never throws).
- `GET /api/user/[userId]` → `resolveUserWithJobs` → `UserWithJobs` or `404`.
  **Contract note:** the payload includes `salary_range`; consumers MUST strip
  salary before rendering or sending to an LLM.

### State management
- **Global / cross-workflow:** `src/store/useWebStore.ts` (Zustand). Holds the web
  snapshot (`state`, `goal`, `nodes`, `edges`) plus `viewerProfile`, and actions
  (`setGoal`, `seedWeb`, `addSecondDegreeNode`, `updateInteractionScore`,
  `expandWeb`, `resetWeb`, `setViewerProfile`). Scores are clamped to `[0, 100]`.
- **Local `/web` board state:** `src/components/web/boardState.ts` — a framework-free
  reducer driving the `empty → seeded → expanded` state machine, consumed via
  `useReducer` in `WebBoard.tsx`.

## 5. Notable Constraints
- **`@ant-design/icons` (v6) has no `"use client"` boundary** — any module importing
  an icon must itself be `"use client"`, or `next build` fails with
  `createContext is not a function` during RSC page-data collection.
- **`next/font` fetches Source Sans 3 at build time** (`layout.tsx`), so `next build`
  can fail in network-restricted environments.
- **Web ids** follow `${source}__${target}` for edges across all web modules.
