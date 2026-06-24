# Conventions

> Coding, typing, UI, and collaboration conventions inferred from the existing
> codebase. Follow these when adding or changing code.

## 1. Language, Linting & Formatting

- **TypeScript everywhere**, strict mode on (`tsconfig.json`: `"strict": true`,
  `noEmit`, `isolatedModules`, `moduleResolution: "bundler"`).
- **Path alias:** import from `@/*` (maps to `src/*`) — used consistently; avoid
  long relative `../../` chains. Mirrored in `vitest.config.ts`.
- **ESLint:** `eslint-config-next` core-web-vitals + typescript presets
  (`eslint.config.mjs`). Run with `npm run lint` (`eslint .`).
- **Mixed quote/semicolon styles exist by area** — there is no Prettier config.
  Two prevailing local styles:
  - `lib/`, `store/`, `types/`, `app/api/`: **single quotes, no semicolons,
    2-space indent**.
  - `components/`, `app/` pages, `mocks/`: **double quotes, semicolons**.
  Match the style of the file/folder you are editing rather than imposing one globally.
- **No `console` except deliberate fallbacks** — `console.warn` is used only to
  surface that an LLM call failed before falling back (`goalParser`, `talkingPoints`).

## 2. Typing Strictness

- **Strong, explicit typing.** Shared contracts live in `src/types/` and are treated
  as a **frozen cross-workflow interface** ("change with care"). Examples:
  `WebNode`, `WebEdge`, `WebSnapshot`, `ParsedGoal`, `User`/`UserWithJobs`, `Job`,
  `JobMatch`, `SharedContext`, `TalkingPointsRequest/Response`.
- **`interface` for object/data shapes**, `type` for unions/aliases
  (e.g. `type AlignmentTier = 'strong' | 'moderate' | 'weak'`,
  `type WebState = 'empty' | 'seeded' | 'expanded'`).
- **Literal/union types over loose strings** for finite domains (degrees `1 | 2`,
  tiers, states, shared-context `type`).
- **Runtime validation at trust boundaries:** every API Route Handler validates the
  request body with a **zod** schema and returns `400` with `error` + `issues` on
  failure. The AI SDK uses zod schemas for structured LLM output, too.
- **No Pydantic / Python** — this is a TS-only repo.
- Exported public functions carry explicit parameter and return types; pure `lib/`
  functions declare input/output interfaces (e.g. `BuildWebInput`/`BuildWebOutput`).

## 3. Architecture & Code Organization Patterns

- **Pure logic is separated from I/O and React.** All ranking/scoring/parsing/
  matching lives in `src/lib/` as pure, deterministic functions; Route Handlers are
  thin adapters that validate and delegate. This keeps logic exhaustively unit-testable.
- **Dependency injection for testability:** functions accept optional overrides
  (e.g. `buildWeb({ ..., scorer })` defaults to the real scorer but lets tests inject one).
- **Named constants for tunables** (e.g. `FIRST_DEGREE_MIN_SCORE`, `WEIGHTS`,
  `MAX_JOB_MATCHES`, `LLM_TIMEOUT_MS`) — no magic numbers inline.
- **Module-level memoization** for immutable remote datasets (`lib/data.ts`) with a
  `__reset...ForTests()` escape hatch instead of exposing internals.
- **Graceful, never-throw AI paths:** LLM helpers return a valid fallback on missing
  key / timeout / bad output rather than throwing.
- **Stable id conventions:** edge ids are always `` `${source}__${target}` `` across
  every web module.

## 4. UI Component Patterns

- **Functional components only**, default-exported per file; named exports for
  panels/widgets that ship constants alongside them (e.g. `JobsPanel`, `JOBS_PANEL_WIDTH`).
- **`"use client"` discipline:** any component importing `@ant-design/icons` (or using
  hooks/state) starts with `"use client"`. Server Components (e.g. `app/page.tsx`)
  stay free of client-only imports. This is mandatory — icons lack a client boundary.
- **Ant Design first.** Build from AntD primitives (`Card`, `Button`, `Space`,
  `Typography`, `Input`, `Select`, `Tag`, `Progress`, `Empty`, `Avatar`) and theme
  them via tokens in `src/theme.ts` (LinkedIn palette: primary `#0a66c2`). Avoid
  re-styling AntD with ad-hoc CSS where a token exists.
- **Styling:** inline `style={{...}}` for layout/one-offs; shared shell styles live in
  `src/app/globals.css` with BEM-ish class names (`top-nav-tab`, `profile-card-body`).
  No Tailwind, no CSS modules.
- **Local state:** `useReducer` with a pure, framework-free reducer for non-trivial
  state machines (`components/web/boardState.ts`); cross-workflow state goes through
  the Zustand store via selector access `useWebStore((s) => s.x)`.
- **Accessibility:** interactive controls get `aria-label`s; nav links set
  `aria-current="page"` when active.
- **Presentational vs. owned logic is labelled.** Components that render a control
  surface whose real behavior belongs to another workflow say so in a comment
  (e.g. "Dynamic filters (presentational; filtering owned by W2/W4)").

## 5. Mocks & Cross-Workflow Integration

- When a workflow depends on an unbuilt upstream one, create **clearly-labelled MOCK
  modules** (`src/mocks/`) that **reuse the exact symbol names and API paths** of the
  real upstream spec, kept in separate files. The header comment marks them, e.g.
  `// ⚠️ W3 MOCK — replace with W1 real impl at src/store/useWebStore.ts`.
- Mocks **mirror the real API surface exactly** so swapping to the real module is a
  one-line import change (the Zustand store deliberately preserves the mock's
  `useWebStore((s) => s.x)` selector signature and state fields).
- Test/dev-only helpers are prefixed `__` (e.g. `__setMockWebState`,
  `__resetDataCachesForTests`) and explicitly noted as not part of the public API.

## 6. Testing Conventions

- **Vitest** with jsdom + Testing Library. Test files sit **next to source** as
  `*.test.ts(x)` (or under `__tests__/`), included via `src/**/*.{test,spec}.{ts,tsx}`.
- Pure `lib/` functions are unit-tested directly; components via Testing Library;
  reducers/state machines tested as plain functions.
- `npm test` runs **`tsc --noEmit` first, then `vitest run`** — type-checking is part
  of the test gate. Keep the build type-clean.
- Tests assert behavioral guarantees explicitly (e.g. "does not include any salary
  terminology in the prompt").

## 7. Collaboration & Code-Review Standards (inferred)

- **Heavy "why" comments / module headers.** Most `lib/` files open with a banner
  explaining ownership (which workflow owns it), the algorithm, and invariants.
  Comments justify non-obvious decisions, not restate code. Match this density in
  `lib/`; keep components lightly commented.
- **Workflow ownership is explicit.** Code is annotated with the owning workflow
  (W1–W4) and documents cross-workflow contract boundaries (e.g. the salary-stripping
  contract on `GET /api/user/[userId]`).
- **Separate files to avoid merge conflicts.** Mocks and per-workflow modules are kept
  in distinct files so parallel work doesn't collide.
- **Contracts in `src/types/` are stable interfaces** — changes there are flagged as
  high-impact ("change with care"); prefer additive/optional fields for compatibility.
- Detailed scopes/plans live in `plan/features/workflow-*/`; consult them before
  changing a workflow's behavior.
