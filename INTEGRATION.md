# W3 ↔ Upstream Integration Checklist

W3 (Node Sidebar) was built behind **clearly-labeled MOCK modules** that reuse the exact
symbol names / API paths from W1/W2/W4. When the real upstream lands, swap each mock for the
real import below and delete the mock file. Tests should pass unchanged.

## Mock → Real swap checklist

| Mock (delete after swap) | Replace import with (real owner) | Owner |
|--------------------------|----------------------------------|-------|
| `src/mocks/web.ts` | `src/types/web.ts` | W1 |
| `src/mocks/data.ts` | `src/types/data.ts` | W2 |
| `src/mocks/alignmentColors.ts` | `src/lib/alignmentColors.ts` | W1 |
| `src/mocks/useWebStore.ts` | `src/store/useWebStore.ts` (real zustand) | W1 (+ W4 `addSecondDegreeNode`) |
| `src/mocks/userApi.ts` (`fetchUserWithJobs`) | `fetch('/api/user/' + userId)` | W2 |
| OpenRouter env in `api/node/talking-points` | real OpenRouter config | W2 |
| `vitest.config.mts` / `vitest.setup.ts` (W3-temporary) | reconcile with W1 stack bootstrap | W1 |

## W3 provides (real, no swap needed)
- `POST /api/node/talking-points` — owned by W3.
- `<CareerTimelineSlot />` placeholder inside `NodeSidebar` — W4 mounts `CareerTimeline` here.
- `src/types/sharedContext.ts` (`SharedContext`) + `src/lib/sharedContext.ts` (`getSharedContext`).

## Swap procedure
1. Merge the upstream workflow.
2. Replace `@/mocks/<x>` imports with the real path across W3 files.
3. Delete the corresponding `src/mocks/<x>.ts`.
4. Run `npm test` — green confirms the contract matched.
